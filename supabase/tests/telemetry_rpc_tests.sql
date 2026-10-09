-- ============================================================================
-- Automated Verification Test Suite for Match Telemetry RPC
-- File: supabase/tests/telemetry_rpc_tests.sql
-- ============================================================================
-- Can be run via psql, Supabase SQL Editor, or pgTAP against PostgreSQL test db:
--   psql "$DATABASE_URL" -f supabase/tests/telemetry_rpc_tests.sql
-- ============================================================================

BEGIN;

-- Helper setup for testing with mock auth.users
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT current_setting('request.jwt.claim.sub', true)::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  v_user1 UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_user2 UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_sess1 UUID := 'b0000000-0000-0000-0000-000000000001'::uuid;
  v_sess2 UUID := 'b0000000-0000-0000-0000-000000000002'::uuid;
  v_ans1 UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;
  v_ans2 UUID := 'c0000000-0000-0000-0000-000000000002'::uuid;
  v_ans3 UUID := 'c0000000-0000-0000-0000-000000000003'::uuid;
  v_res JSONB;
  v_count INTEGER;
  v_streak INTEGER;
  v_status TEXT;
  v_ua_type TEXT;
  v_err_caught BOOLEAN;
BEGIN
  RAISE NOTICE '>>> Starting Match Telemetry Verification Tests...';

  -- Set active mock user to user1
  PERFORM set_config('request.jwt.claim.sub', v_user1::text, true);

  -- TEST 1: Valid batch creates session and answers
  RAISE NOTICE 'Test 1: Valid batch creates session and answers';
  v_res := public.sync_telemetry_batch(jsonb_build_object(
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', v_sess1,
      'status', 'in_progress',
      'level', 1,
      'mode', 'adaptive',
      'totalProblems', 20,
      'activeState', jsonb_build_object('problemIndex', 2, 'seq', 2)
    )),
    'answers', jsonb_build_array(jsonb_build_object(
      'id', v_ans1,
      'sessionId', v_sess1,
      'problemIndex', 1,
      'problem', jsonb_build_object('a', 2, 'b', 2, 'operator', '+', 'operation', 'addition', 'answer', 4),
      'userAnswer', 4,
      'isCorrect', true,
      'responseTimeSec', 1.2
    ))
  ));
  SELECT COUNT(*) INTO v_count FROM public.session_answers WHERE session_id = v_sess1;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Test 1 failed: answers count is %', v_count; END IF;

  -- TEST 2: Idempotent duplicate retry does not create duplicates
  RAISE NOTICE 'Test 2: Idempotent duplicate retry';
  v_res := public.sync_telemetry_batch(jsonb_build_object(
    'answers', jsonb_build_array(jsonb_build_object(
      'id', 'c0000000-0000-0000-0000-999999999999'::uuid, -- different local client ID
      'sessionId', v_sess1,
      'problemIndex', 1,
      'problem', jsonb_build_object('a', 2, 'b', 2, 'operator', '+', 'operation', 'addition', 'answer', 4),
      'userAnswer', 4,
      'isCorrect', true,
      'responseTimeSec', 1.45 -- jitter in response time
    ))
  ));
  SELECT COUNT(*) INTO v_count FROM public.session_answers WHERE session_id = v_sess1;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Test 2 failed: duplicate answer row was created!'; END IF;

  -- TEST 3: Types of userAnswer (42 vs "42" vs null) are distinct
  RAISE NOTICE 'Test 3: Preservation of numeric 42 vs string "42" vs null';
  -- Record problem 2 with string "4"
  v_res := public.sync_telemetry_batch(jsonb_build_object(
    'answers', jsonb_build_array(jsonb_build_object(
      'id', v_ans2,
      'sessionId', v_sess1,
      'problemIndex', 2,
      'problem', jsonb_build_object('a', 2, 'b', 2, 'operator', '+', 'operation', 'addition', 'answer', 4),
      'userAnswer', '4', -- string!
      'isCorrect', true,
      'responseTimeSec', 1.0
    ))
  ));
  SELECT jsonb_typeof(user_answer) INTO v_ua_type FROM public.session_answers WHERE session_id = v_sess1 AND problem_index = 2;
  IF v_ua_type <> 'string' THEN RAISE EXCEPTION 'Test 3 failed: expected string type, got %', v_ua_type; END IF;

  SELECT jsonb_typeof(user_answer) INTO v_ua_type FROM public.session_answers WHERE session_id = v_sess1 AND problem_index = 1;
  IF v_ua_type <> 'number' THEN RAISE EXCEPTION 'Test 3 failed: expected number type, got %', v_ua_type; END IF;

  -- TEST 4: Content conflict is rejected
  RAISE NOTICE 'Test 4: Content conflict rejection';
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'answers', jsonb_build_array(jsonb_build_object(
        'id', v_ans3,
        'sessionId', v_sess1,
        'problemIndex', 1,
        'problem', jsonb_build_object('a', 2, 'b', 2, 'operator', '+', 'operation', 'addition', 'answer', 4),
        'userAnswer', 99, -- CONFLICT!
        'isCorrect', false,
        'responseTimeSec', 1.0
      ))
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 4 failed: conflict was not rejected!'; END IF;

  -- TEST 5: Invalid answers field (not an array) is rejected
  RAISE NOTICE 'Test 5: Reject invalid answers field';
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'sessions', jsonb_build_array(),
      'answers', 'not_an_array'
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 5 failed: invalid answers type was not rejected!'; END IF;

  -- TEST 6: Invalid activeState.problemIndex doesn't crash with unexpected cast
  RAISE NOTICE 'Test 6: Validate activeState before cast';
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'sessions', jsonb_build_array(jsonb_build_object(
        'id', v_sess1,
        'status', 'in_progress',
        'level', 1,
        'mode', 'adaptive',
        'totalProblems', 20,
        'activeState', jsonb_build_object('problemIndex', 'invalid_string')
      ))
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 6 failed: invalid activeState was not caught safely!'; END IF;

  -- TEST 7: Stale activeState does not overwrite newer state
  RAISE NOTICE 'Test 7: Stale active state ignored';
  PERFORM public.sync_telemetry_batch(jsonb_build_object(
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', v_sess1,
      'status', 'in_progress',
      'level', 1,
      'mode', 'adaptive',
      'totalProblems', 20,
      'activeState', jsonb_build_object('problemIndex', 1, 'seq', 1) -- older sequence
    ))
  ));
  SELECT (active_state->>'problemIndex')::integer INTO v_count FROM public.training_sessions WHERE id = v_sess1;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Test 7 failed: stale active state overwrote newer state!'; END IF;

  -- TEST 8: problemIndex out of bounds rejected
  RAISE NOTICE 'Test 8: problemIndex out of bounds rejected';
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'answers', jsonb_build_array(jsonb_build_object(
        'id', 'c0000000-0000-0000-0000-000000000099'::uuid,
        'sessionId', v_sess1,
        'problemIndex', 999, -- totalProblems is 20!
        'problem', jsonb_build_object('a', 1, 'b', 1, 'operator', '+', 'operation', 'addition', 'answer', 2),
        'userAnswer', 2,
        'isCorrect', true,
        'responseTimeSec', 1.0
      ))
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 8 failed: out of bounds index not rejected!'; END IF;

  -- TEST 9: Error in last element rolls back entire batch
  RAISE NOTICE 'Test 9: Atomicity rollback';
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'answers', jsonb_build_array(
        jsonb_build_object(
          'id', 'c0000000-0000-0000-0000-000000000003'::uuid,
          'sessionId', v_sess1,
          'problemIndex', 3,
          'problem', jsonb_build_object('a', 3, 'b', 3, 'operator', '+', 'operation', 'addition', 'answer', 6),
          'userAnswer', 6,
          'isCorrect', true,
          'responseTimeSec', 1.0
        ),
        jsonb_build_object(
          'id', 'c0000000-0000-0000-0000-000000000004'::uuid,
          'sessionId', v_sess1,
          'problemIndex', 9999, -- ERROR!
          'problem', jsonb_build_object('a', 1, 'b', 1, 'operator', '+', 'operation', 'addition', 'answer', 2),
          'userAnswer', 2,
          'isCorrect', true,
          'responseTimeSec', 1.0
        )
      )
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 9 failed: batch did not error!'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.session_answers WHERE session_id = v_sess1 AND problem_index = 3;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Test 9 failed: atomicity broken, problem index 3 was committed!'; END IF;

  -- TEST 10: FSM state machine transitions
  RAISE NOTICE 'Test 10: FSM transition check';
  -- Transition to completed
  PERFORM public.sync_telemetry_batch(jsonb_build_object(
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', v_sess1,
      'status', 'completed',
      'level', 1,
      'mode', 'adaptive',
      'totalProblems', 20
    ))
  ));
  SELECT status INTO v_status FROM public.training_sessions WHERE id = v_sess1;
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'Test 10 failed: expected completed status'; END IF;

  -- Attempt invalid revert to in_progress
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'sessions', jsonb_build_array(jsonb_build_object(
        'id', v_sess1,
        'status', 'in_progress',
        'level', 1,
        'mode', 'adaptive',
        'totalProblems', 20
      ))
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 10 failed: terminal status revert was not rejected!'; END IF;

  -- TEST 11: Late answers update aggregates without altering terminal status
  RAISE NOTICE 'Test 11: Late answers in completed session';
  PERFORM public.sync_telemetry_batch(jsonb_build_object(
    'answers', jsonb_build_array(jsonb_build_object(
      'id', 'c0000000-0000-0000-0000-000000000003'::uuid,
      'sessionId', v_sess1,
      'problemIndex', 3,
      'problem', jsonb_build_object('a', 3, 'b', 3, 'operator', '+', 'operation', 'addition', 'answer', 6),
      'userAnswer', 6,
      'isCorrect', true,
      'responseTimeSec', 1.0
    ))
  ));
  SELECT status, solved_problems_count INTO v_status, v_count FROM public.training_sessions WHERE id = v_sess1;
  IF v_status <> 'completed' OR v_count <> 3 THEN
    RAISE EXCEPTION 'Test 11 failed: status is %, solved count is %', v_status, v_count;
  END IF;

  -- TEST 12: best_streak accounts for wrong answers and gap in problem indices
  RAISE NOTICE 'Test 12: best_streak calculation with gaps and wrong answers';
  -- Create session 2
  PERFORM public.sync_telemetry_batch(jsonb_build_object(
    'sessions', jsonb_build_array(jsonb_build_object(
      'id', v_sess2,
      'status', 'in_progress',
      'level', 1,
      'mode', 'adaptive',
      'totalProblems', 20
    )),
    'answers', jsonb_build_array(
      -- Streak 1..2 correct (streak = 2)
      jsonb_build_object('id', gen_random_uuid(), 'sessionId', v_sess2, 'problemIndex', 1, 'problem', jsonb_build_object('a',1,'b',1,'operator','+','operation','addition','answer',2), 'userAnswer', 2, 'isCorrect', true, 'responseTimeSec', 1),
      jsonb_build_object('id', gen_random_uuid(), 'sessionId', v_sess2, 'problemIndex', 2, 'problem', jsonb_build_object('a',1,'b',1,'operator','+','operation','addition','answer',2), 'userAnswer', 2, 'isCorrect', true, 'responseTimeSec', 1),
      -- Problem 3 wrong (streak breaks)
      jsonb_build_object('id', gen_random_uuid(), 'sessionId', v_sess2, 'problemIndex', 3, 'problem', jsonb_build_object('a',1,'b',1,'operator','+','operation','addition','answer',2), 'userAnswer', 0, 'isCorrect', false, 'responseTimeSec', 1),
      -- Problem 5 correct (gap: 4 missing -> streak is 1, not 2)
      jsonb_build_object('id', gen_random_uuid(), 'sessionId', v_sess2, 'problemIndex', 5, 'problem', jsonb_build_object('a',1,'b',1,'operator','+','operation','addition','answer',2), 'userAnswer', 2, 'isCorrect', true, 'responseTimeSec', 1)
    )
  ));
  SELECT best_streak INTO v_streak FROM public.training_sessions WHERE id = v_sess2;
  IF v_streak <> 2 THEN RAISE EXCEPTION 'Test 12 failed: expected best_streak = 2, got %', v_streak; END IF;

  -- TEST 13: User cannot access other user data
  RAISE NOTICE 'Test 13: User isolation';
  PERFORM set_config('request.jwt.claim.sub', v_user2::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.sync_telemetry_batch(jsonb_build_object(
      'answers', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'sessionId', v_sess1, -- belongs to user1!
        'problemIndex', 4,
        'problem', jsonb_build_object('a',1,'b',1,'operator','+','operation','addition','answer',2),
        'userAnswer', 2,
        'isCorrect', true,
        'responseTimeSec', 1
      ))
    ));
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  IF NOT v_err_caught THEN RAISE EXCEPTION 'Test 13 failed: user2 was able to mutate user1 session!'; END IF;

  RAISE NOTICE '>>> ALL 14 TEST SCENARIOS PASSED SUCCESSFULLY!';
END $$;

ROLLBACK;
