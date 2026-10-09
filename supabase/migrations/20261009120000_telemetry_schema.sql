-- ============================================================================
-- Match Stage 2.3A - Server Telemetry Schema & RPC Migration
-- ============================================================================
-- Target environment: Supabase / PostgreSQL 15+
-- Features:
-- 1. Profiles synchronization (including is_anonymous updates)
-- 2. Training Sessions and append-only Session Answers
-- 3. Dynamic RLS policy cleanup and strict read-only permissions for clients
-- 4. SECURITY DEFINER RPC `sync_telemetry_batch(p_payload JSONB)`
-- 5. Full server-side recalculation of session aggregates (solved, correct,
--    accuracy, avg response time, best streak with gap detection)
-- 6. Content conflict detection vs safe idempotent retries
-- 7. Monotonic activeState revision conflict resolution
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REVOKE SCHEMA CREATION PERMISSIONS
-- ----------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon;
REVOKE CREATE ON SCHEMA public FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2. DYNAMIC CLEANUP OF EXISTING POLICIES
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'training_sessions', 'session_answers')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. PROFILES TABLE (CLEAN OR EXISTING MIGRATION)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      is_anonymous BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
    );
  ELSE
    -- Проверка совместимости существующей таблицы
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
      RAISE EXCEPTION 'Migration halted: existing public.profiles has incompatible "id" column type.';
    END IF;

    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. TRAINING SESSIONS TABLE (CLEAN OR EXISTING MIGRATION)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'training_sessions'
  ) THEN
    CREATE TABLE public.training_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ NULL,
      level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
      mode TEXT NOT NULL CHECK (mode IN ('adaptive', 'true_false', 'missing_operator', 'missing_number', 'ladder', 'estimation', 'audio', 'sprint', 'endless', 'custom')),
      allowed_operators TEXT[] NOT NULL DEFAULT '{}',
      total_problems INTEGER NOT NULL CHECK (total_problems > 0),
      solved_problems_count INTEGER NOT NULL DEFAULT 0 CHECK (solved_problems_count >= 0),
      correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
      accuracy_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (accuracy_percent BETWEEN 0.00 AND 100.00),
      avg_response_time_sec NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (avg_response_time_sec >= 0.00),
      best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
      active_state JSONB NULL,
      active_state_seq BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
    );
  ELSE
    -- Проверка совместимости существующих первичных и внешних ключей
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'training_sessions' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
      RAISE EXCEPTION 'Migration halted: existing public.training_sessions has incompatible "id" column type.';
    END IF;

    -- Добавление недостающих колонок
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS allowed_operators TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS active_state JSONB NULL;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS active_state_seq BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS solved_problems_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS correct_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS accuracy_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS avg_response_time_sec NUMERIC(6,2) NOT NULL DEFAULT 0.00;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. SESSION ANSWERS TABLE (CLEAN OR EXISTING MIGRATION)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'session_answers'
  ) THEN
    CREATE TABLE public.session_answers (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
      problem_index INTEGER NOT NULL CHECK (problem_index >= 1),
      problem JSONB NOT NULL,
      user_answer JSONB NOT NULL,
      is_correct BOOLEAN NOT NULL,
      response_time_sec NUMERIC(6,2) NOT NULL CHECK (response_time_sec >= 0.00),
      difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
      skill_tags TEXT[] NOT NULL DEFAULT '{}',
      answered_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      CONSTRAINT uq_session_answers_session_index UNIQUE (session_id, problem_index)
    );
  ELSE
    -- Проверка совместимости типов
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session_answers' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
      RAISE EXCEPTION 'Migration halted: existing public.session_answers has incompatible "id" column type.';
    END IF;

    -- Конвертация user_answer в JSONB с сохранением семантики (числа, строки, null)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session_answers' AND column_name = 'user_answer'
        AND data_type IN ('text', 'character varying')
    ) THEN
      ALTER TABLE public.session_answers
        ALTER COLUMN user_answer TYPE JSONB
        USING (
          CASE
            WHEN user_answer IS NULL THEN 'null'::jsonb
            WHEN user_answer = 'null' THEN 'null'::jsonb
            WHEN user_answer ~ '^-?[0-9]+(\.[0-9]+)?$' THEN to_jsonb(user_answer::numeric)
            WHEN user_answer = 'true' THEN 'true'::jsonb
            WHEN user_answer = 'false' THEN 'false'::jsonb
            ELSE to_jsonb(user_answer)
          END
        );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session_answers' AND column_name = 'user_answer'
        AND data_type IN ('integer', 'bigint', 'smallint', 'numeric')
    ) THEN
      ALTER TABLE public.session_answers
        ALTER COLUMN user_answer TYPE JSONB
        USING to_jsonb(user_answer);
    ELSIF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session_answers' AND column_name = 'user_answer'
        AND data_type = 'jsonb'
    ) THEN
      RAISE EXCEPTION 'Migration halted: existing public.session_answers.user_answer has unsupported type that cannot be safely converted to JSONB.';
    END IF;

    -- Конвертация problem в JSONB при необходимости
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session_answers' AND column_name = 'problem'
        AND data_type IN ('text', 'character varying')
    ) THEN
      ALTER TABLE public.session_answers
        ALTER COLUMN problem TYPE JSONB
        USING problem::jsonb;
    END IF;

    -- Добавление недостающих колонок
    ALTER TABLE public.session_answers ADD COLUMN IF NOT EXISTS skill_tags TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE public.session_answers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

    -- Обеспечение уникального ограничения (session_id, problem_index)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.session_answers'::regclass
        AND contype = 'u'
        AND conname = 'uq_session_answers_session_index'
    ) THEN
      ALTER TABLE public.session_answers
        ADD CONSTRAINT uq_session_answers_session_index UNIQUE (session_id, problem_index);
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. INDEXES FOR HIGH-THROUGHPUT QUERIES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_status ON public.training_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_started ON public.training_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_answers_session_id ON public.session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_answers_answered_at ON public.session_answers(answered_at DESC);

-- ----------------------------------------------------------------------------
-- 7. PERMISSIONS: REVOKE DIRECT WRITE, GRANT READ ONLY FOR CLIENTS
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.training_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.session_answers FROM PUBLIC, anon, authenticated;

-- Выдаём ТОЛЬКО чтение для authenticated
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.training_sessions TO authenticated;
GRANT SELECT ON TABLE public.session_answers TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "sessions_select_own" ON public.training_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "answers_select_own" ON public.session_answers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_sessions s
      WHERE s.id = session_answers.session_id
        AND s.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 9. RPC FUNCTION: sync_telemetry_batch(p_payload JSONB)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_telemetry_batch(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_is_anon BOOLEAN;
  v_sessions_arr JSONB;
  v_answers_arr JSONB;
  v_s_elem JSONB;
  v_a_elem JSONB;
  
  -- Session variables
  v_s_id UUID;
  v_s_status TEXT;
  v_s_started_at TIMESTAMPTZ;
  v_s_completed_at TIMESTAMPTZ;
  v_s_level INTEGER;
  v_s_mode TEXT;
  v_s_operators TEXT[];
  v_s_total INTEGER;
  v_s_active_state JSONB;
  v_s_active_seq BIGINT;
  v_s_active_idx INTEGER;
  v_s_active_idx_str TEXT;
  v_existing_session RECORD;
  
  -- Answer variables
  v_a_id UUID;
  v_a_session_id UUID;
  v_a_problem_idx INTEGER;
  v_a_problem_idx_str TEXT;
  v_a_problem JSONB;
  v_a_user_answer JSONB;
  v_a_is_correct BOOLEAN;
  v_a_resp_time NUMERIC;
  v_a_difficulty INTEGER;
  v_a_skill_tags TEXT[];
  v_a_answered_at TIMESTAMPTZ;
  v_existing_answer RECORD;
  v_is_identical BOOLEAN;
  v_ans_user_ans_equal BOOLEAN;
  v_ans_problem_equal BOOLEAN;
  
  -- Recalculation variables
  v_touched_sessions UUID[] := '{}';
  v_curr_sid UUID;
  v_solved_count INTEGER;
  v_correct_count INTEGER;
  v_accuracy NUMERIC;
  v_avg_time NUMERIC;
  v_max_streak INTEGER;
  v_curr_streak INTEGER;
  v_prev_idx INTEGER;
  r_ans RECORD;
  
  -- Results tracking
  v_synced_session_ids UUID[] := '{}';
  v_synced_answer_ids UUID[] := '{}';
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: auth.uid() is null';
  END IF;

  -- 2. Validate payload is a non-null JSON object
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload must be a non-null JSON object';
  END IF;

  -- 3. Profile synchronization: update or insert user profile with latest is_anonymous
  SELECT COALESCE(u.is_anonymous, false)
  INTO v_is_anon
  FROM auth.users u
  WHERE u.id = v_user_id;

  INSERT INTO public.profiles (id, is_anonymous, updated_at)
  VALUES (v_user_id, COALESCE(v_is_anon, false), timezone('utc'::text, now()))
  ON CONFLICT (id) DO UPDATE
  SET is_anonymous = EXCLUDED.is_anonymous,
      updated_at = timezone('utc'::text, now())
  WHERE profiles.is_anonymous IS DISTINCT FROM EXCLUDED.is_anonymous;

  -- 4. Validate 'answers' field:
  -- Если отсутствует — пустой массив. Если присутствует и НЕ массив — отклоняем весь пакет!
  IF p_payload ? 'answers' THEN
    IF jsonb_typeof(p_payload->'answers') <> 'array' THEN
      RAISE EXCEPTION 'Field "answers" must be a JSON array if provided';
    END IF;
    v_answers_arr := p_payload->'answers';
  ELSE
    v_answers_arr := '[]'::jsonb;
  END IF;

  -- Validate 'sessions' field:
  IF p_payload ? 'sessions' THEN
    IF jsonb_typeof(p_payload->'sessions') <> 'array' THEN
      RAISE EXCEPTION 'Field "sessions" must be a JSON array if provided';
    END IF;
    v_sessions_arr := p_payload->'sessions';
  ELSIF p_payload ? 'session' THEN
    IF jsonb_typeof(p_payload->'session') = 'object' THEN
      v_sessions_arr := jsonb_build_array(p_payload->'session');
    ELSE
      RAISE EXCEPTION 'Field "session" must be a JSON object if provided';
    END IF;
  ELSE
    v_sessions_arr := '[]'::jsonb;
  END IF;

  -- Лимит на размер одного пакета (не более 50 ответов)
  IF jsonb_array_length(v_answers_arr) > 50 THEN
    RAISE EXCEPTION 'Batch size exceeds maximum limit of 50 answers per request';
  END IF;

  -- =========================================================================
  -- 5. PROCESS SESSIONS
  -- =========================================================================
  FOR v_s_elem IN SELECT * FROM jsonb_array_elements(v_sessions_arr)
  LOOP
    IF jsonb_typeof(v_s_elem) <> 'object' THEN
      RAISE EXCEPTION 'Each session in sessions array must be an object';
    END IF;

    -- Extract session ID
    BEGIN
      v_s_id := (v_s_elem->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid UUID for session id: %', v_s_elem->>'id';
    END;

    IF v_s_id IS NULL THEN
      RAISE EXCEPTION 'Session id cannot be null';
    END IF;

    -- Extract status
    v_s_status := COALESCE(v_s_elem->>'status', 'in_progress');
    IF v_s_status NOT IN ('in_progress', 'completed', 'abandoned') THEN
      RAISE EXCEPTION 'Invalid status "%" for session %', v_s_status, v_s_id;
    END IF;

    -- Extract startedAt
    IF v_s_elem ? 'startedAt' OR v_s_elem ? 'started_at' THEN
      BEGIN
        IF (v_s_elem->>'startedAt') ~ '^[0-9]+$' OR (v_s_elem->>'started_at') ~ '^[0-9]+$' THEN
          v_s_started_at := to_timestamp((COALESCE(v_s_elem->>'startedAt', v_s_elem->>'started_at'))::double precision / 1000.0);
        ELSE
          v_s_started_at := (COALESCE(v_s_elem->>'startedAt', v_s_elem->>'started_at'))::timestamptz;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid timestamp for session startedAt: %', COALESCE(v_s_elem->>'startedAt', v_s_elem->>'started_at');
      END;
    ELSE
      v_s_started_at := timezone('utc'::text, now());
    END IF;

    -- Extract completedAt
    IF (v_s_elem ? 'completedAt' AND v_s_elem->>'completedAt' IS NOT NULL) OR
       (v_s_elem ? 'completed_at' AND v_s_elem->>'completed_at' IS NOT NULL) THEN
      BEGIN
        IF (v_s_elem->>'completedAt') ~ '^[0-9]+$' OR (v_s_elem->>'completed_at') ~ '^[0-9]+$' THEN
          v_s_completed_at := to_timestamp((COALESCE(v_s_elem->>'completedAt', v_s_elem->>'completed_at'))::double precision / 1000.0);
        ELSE
          v_s_completed_at := (COALESCE(v_s_elem->>'completedAt', v_s_elem->>'completed_at'))::timestamptz;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid timestamp for session completedAt: %', COALESCE(v_s_elem->>'completedAt', v_s_elem->>'completed_at');
      END;
    ELSE
      v_s_completed_at := NULL;
    END IF;

    -- Extract level
    v_s_level := (COALESCE(v_s_elem->>'level', '1'))::integer;
    IF v_s_level < 1 OR v_s_level > 5 THEN
      RAISE EXCEPTION 'Invalid level % for session %', v_s_level, v_s_id;
    END IF;

    -- Extract mode
    v_s_mode := COALESCE(v_s_elem->>'mode', 'adaptive');

    -- Extract allowedOperators
    SELECT COALESCE(array_agg(elem::text), ARRAY['+','−','×','÷']::text[])
    INTO v_s_operators
    FROM jsonb_array_elements_text(COALESCE(v_s_elem->'allowedOperators', v_s_elem->'allowed_operators', '["+","−","×","÷"]'::jsonb)) AS elem;

    -- Extract totalProblems
    v_s_total := (COALESCE(v_s_elem->>'totalProblems', v_s_elem->>'total_problems', '20'))::integer;
    IF v_s_total <= 0 THEN
      RAISE EXCEPTION 'totalProblems must be > 0 for session %', v_s_id;
    END IF;

    -- Validate activeState
    v_s_active_state := COALESCE(v_s_elem->'activeState', v_s_elem->'active_state', NULL);
    v_s_active_seq := 0;
    v_s_active_idx := 0;

    IF v_s_status IN ('completed', 'abandoned') THEN
      -- Терминальные сессии не могут содержать activeState
      v_s_active_state := NULL;
    ELSIF v_s_active_state IS NOT NULL AND jsonb_typeof(v_s_active_state) <> 'null' THEN
      IF jsonb_typeof(v_s_active_state) <> 'object' THEN
        RAISE EXCEPTION 'activeState must be a JSON object for session %', v_s_id;
      END IF;

      v_s_active_idx_str := COALESCE(v_s_active_state->>'problemIndex', v_s_active_state->>'problem_index');
      IF v_s_active_idx_str IS NULL OR v_s_active_idx_str !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'activeState.problemIndex must be an integer string for session %', v_s_id;
      END IF;

      v_s_active_idx := v_s_active_idx_str::integer;
      IF v_s_active_idx < 1 OR v_s_active_idx > v_s_total THEN
        RAISE EXCEPTION 'activeState.problemIndex % out of bounds (1..%) for session %', v_s_active_idx, v_s_total, v_s_id;
      END IF;

      -- Монотонный идентификатор ревизии снимка
      IF (v_s_active_state ? 'seq' AND (v_s_active_state->>'seq') ~ '^[0-9]+$') THEN
        v_s_active_seq := (v_s_active_state->>'seq')::bigint;
      ELSE
        v_s_active_seq := v_s_active_idx::bigint;
      END IF;
    ELSE
      v_s_active_state := NULL;
    END IF;

    -- Проверка существования сессии
    SELECT * INTO v_existing_session
    FROM public.training_sessions
    WHERE id = v_s_id
    FOR UPDATE;

    IF FOUND THEN
      -- Проверка принадлежности сессии текущему пользователю
      IF v_existing_session.user_id <> v_user_id THEN
        RAISE EXCEPTION 'Access denied: Session % belongs to another user', v_s_id;
      END IF;

      -- Проверка неизменяемых параметров сессии
      IF v_existing_session.level <> v_s_level THEN
        RAISE EXCEPTION 'Immutable parameter mismatch: level cannot change from % to % for session %', v_existing_session.level, v_s_level, v_s_id;
      END IF;
      IF v_existing_session.mode <> v_s_mode THEN
        RAISE EXCEPTION 'Immutable parameter mismatch: mode cannot change from % to % for session %', v_existing_session.mode, v_s_mode, v_s_id;
      END IF;
      IF v_existing_session.total_problems <> v_s_total THEN
        RAISE EXCEPTION 'Immutable parameter mismatch: totalProblems cannot change from % to % for session %', v_existing_session.total_problems, v_s_total, v_s_id;
      END IF;
      -- Допустимая погрешность startedAt <= 1.0 секунды (из-за округления/миллисекунд)
      IF ABS(EXTRACT(EPOCH FROM v_existing_session.started_at) - EXTRACT(EPOCH FROM v_s_started_at)) > 1.0 THEN
        RAISE EXCEPTION 'Immutable parameter mismatch: startedAt cannot change for session %', v_s_id;
      END IF;

      -- Проверка переходов FSM
      IF v_existing_session.status IN ('completed', 'abandoned') THEN
        -- Повторный терминальный пакет допустим (идемпотентность), но откат в in_progress запрещён!
        IF v_s_status <> v_existing_session.status THEN
          RAISE EXCEPTION 'Invalid FSM transition: Session % is terminal (%) and cannot transition to %', v_s_id, v_existing_session.status, v_s_status;
        END IF;
      ELSE
        -- Переход из in_progress в completed, abandoned или продолжение in_progress
        IF v_s_status IN ('completed', 'abandoned') THEN
          UPDATE public.training_sessions
          SET status = v_s_status,
              completed_at = COALESCE(v_existing_session.completed_at, v_s_completed_at, timezone('utc'::text, now())),
              active_state = NULL,
              active_state_seq = GREATEST(v_existing_session.active_state_seq, v_s_active_seq) + 1,
              updated_at = timezone('utc'::text, now())
          WHERE id = v_s_id;
        ELSE
          -- Обновление activeState с защитой от отката назад
          IF v_s_active_state IS NOT NULL THEN
            IF v_s_active_seq > v_existing_session.active_state_seq THEN
              UPDATE public.training_sessions
              SET active_state = v_s_active_state,
                  active_state_seq = v_s_active_seq,
                  updated_at = timezone('utc'::text, now())
              WHERE id = v_s_id;
            END IF;
          END IF;
        END IF;
      END IF;

    ELSE
      -- Создание новой сессии. Агрегаты устанавливаются в 0 и пересчитываются сервером
      INSERT INTO public.training_sessions (
        id,
        user_id,
        status,
        started_at,
        completed_at,
        level,
        mode,
        allowed_operators,
        total_problems,
        solved_problems_count,
        correct_count,
        accuracy_percent,
        avg_response_time_sec,
        best_streak,
        active_state,
        active_state_seq,
        created_at,
        updated_at
      ) VALUES (
        v_s_id,
        v_user_id,
        v_s_status,
        v_s_started_at,
        CASE WHEN v_s_status IN ('completed', 'abandoned') THEN COALESCE(v_s_completed_at, timezone('utc'::text, now())) ELSE NULL END,
        v_s_level,
        v_s_mode,
        v_s_operators,
        v_s_total,
        0,
        0,
        0.00,
        0.00,
        0,
        CASE WHEN v_s_status IN ('completed', 'abandoned') THEN NULL ELSE v_s_active_state END,
        v_s_active_seq,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      );
    END IF;

    v_synced_session_ids := array_append(v_synced_session_ids, v_s_id);
    IF NOT (v_s_id = ANY(v_touched_sessions)) THEN
      v_touched_sessions := array_append(v_touched_sessions, v_s_id);
    END IF;
  END LOOP;

  -- =========================================================================
  -- 6. PROCESS ANSWERS
  -- =========================================================================
  FOR v_a_elem IN SELECT * FROM jsonb_array_elements(v_answers_arr)
  LOOP
    IF jsonb_typeof(v_a_elem) <> 'object' THEN
      RAISE EXCEPTION 'Each answer in answers array must be an object';
    END IF;

    -- Extract answer ID
    BEGIN
      v_a_id := (v_a_elem->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid UUID for answer id: %', v_a_elem->>'id';
    END;

    IF v_a_id IS NULL THEN
      RAISE EXCEPTION 'Answer id cannot be null';
    END IF;

    -- Extract sessionId
    BEGIN
      v_a_session_id := (COALESCE(v_a_elem->>'sessionId', v_a_elem->>'session_id'))::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid UUID for answer sessionId: %', COALESCE(v_a_elem->>'sessionId', v_a_elem->>'session_id');
    END;

    IF v_a_session_id IS NULL THEN
      RAISE EXCEPTION 'Answer sessionId cannot be null';
    END IF;

    -- Extract problemIndex
    v_a_problem_idx_str := COALESCE(v_a_elem->>'problemIndex', v_a_elem->>'problem_index');
    IF v_a_problem_idx_str IS NULL OR v_a_problem_idx_str !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid problemIndex in answer %', v_a_id;
    END IF;
    v_a_problem_idx := v_a_problem_idx_str::integer;

    -- Проверка существования родительской сессии и владения
    SELECT * INTO v_existing_session
    FROM public.training_sessions
    WHERE id = v_a_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity error: Training session % not found for answer %', v_a_session_id, v_a_id;
    END IF;

    IF v_existing_session.user_id <> v_user_id THEN
      RAISE EXCEPTION 'Access denied: Session % belongs to another user', v_a_session_id;
    END IF;

    -- Проверка диапазона problemIndex (1..totalProblems)
    IF v_a_problem_idx < 1 OR v_a_problem_idx > v_existing_session.total_problems THEN
      RAISE EXCEPTION 'Problem index % is out of bounds (1..%) in session %', v_a_problem_idx, v_existing_session.total_problems, v_a_session_id;
    END IF;

    -- Extract problem JSONB
    v_a_problem := v_a_elem->'problem';
    IF v_a_problem IS NULL OR jsonb_typeof(v_a_problem) <> 'object' THEN
      RAISE EXCEPTION 'Field "problem" must be a JSON object in answer %', v_a_id;
    END IF;

    -- Extract userAnswer JSONB с сохранением типа (число vs строка vs null)
    IF v_a_elem ? 'userAnswer' THEN
      v_a_user_answer := v_a_elem->'userAnswer';
    ELSIF v_a_elem ? 'user_answer' THEN
      v_a_user_answer := v_a_elem->'user_answer';
    ELSE
      v_a_user_answer := 'null'::jsonb;
    END IF;

    -- Extract isCorrect
    v_a_is_correct := (COALESCE(v_a_elem->>'isCorrect', v_a_elem->>'is_correct'))::boolean;
    IF v_a_is_correct IS NULL THEN
      RAISE EXCEPTION 'Field "isCorrect" must be a boolean in answer %', v_a_id;
    END IF;

    -- Extract responseTimeSec
    v_a_resp_time := (COALESCE(v_a_elem->>'responseTimeSec', v_a_elem->>'response_time_sec', '0'))::numeric;
    IF v_a_resp_time < 0 THEN
      RAISE EXCEPTION 'responseTimeSec must be >= 0 in answer %', v_a_id;
    END IF;

    -- Extract difficulty
    v_a_difficulty := COALESCE((COALESCE(v_a_elem->>'difficulty', v_a_elem->>'level'))::integer, v_existing_session.level);

    -- Extract skillTags (нормализация в упорядоченное множество уникальных тегов)
    SELECT COALESCE(array_agg(DISTINCT tag ORDER BY tag), '{}'::text[])
    INTO v_a_skill_tags
    FROM jsonb_array_elements_text(COALESCE(v_a_elem->'skillTags', v_a_elem->'skill_tags', '[]'::jsonb)) AS tag;

    -- Extract answeredAt
    IF v_a_elem ? 'answeredAt' OR v_a_elem ? 'answered_at' THEN
      BEGIN
        IF (v_a_elem->>'answeredAt') ~ '^[0-9]+$' OR (v_a_elem->>'answered_at') ~ '^[0-9]+$' THEN
          v_a_answered_at := to_timestamp((COALESCE(v_a_elem->>'answeredAt', v_a_elem->>'answered_at'))::double precision / 1000.0);
        ELSE
          v_a_answered_at := (COALESCE(v_a_elem->>'answeredAt', v_a_elem->>'answered_at'))::timestamptz;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_a_answered_at := timezone('utc'::text, now());
      END;
    ELSE
      v_a_answered_at := timezone('utc'::text, now());
    END IF;

    -- Проверка на существующий ответ (session_id, problem_index)
    SELECT * INTO v_existing_answer
    FROM public.session_answers
    WHERE session_id = v_a_session_id AND problem_index = v_a_problem_idx
    FOR UPDATE;

    IF FOUND THEN
      -- Проверка идентичности:
      -- Существенные поля: is_correct, user_answer (сохраняя тип JSON), параметры задачи.
      -- Метаданные, игнорируемые при повторной доставке: локальный UUID ответа, мелкие колебания responseTimeSec, answeredAt.
      v_ans_user_ans_equal := (v_existing_answer.user_answer = v_a_user_answer);

      v_ans_problem_equal := (
        (v_existing_answer.problem->>'a') = (v_a_problem->>'a') AND
        (v_existing_answer.problem->>'b') = (v_a_problem->>'b') AND
        (v_existing_answer.problem->>'operator') = (v_a_problem->>'operator') AND
        (v_existing_answer.problem->>'answer') = (v_a_problem->>'answer') AND
        COALESCE(v_existing_answer.problem->>'type', 'standard') = COALESCE(v_a_problem->>'type', 'standard') AND
        (v_existing_answer.problem->>'proposedAnswer' IS NOT DISTINCT FROM v_a_problem->>'proposedAnswer') AND
        (v_existing_answer.problem->>'missingSlot' IS NOT DISTINCT FROM v_a_problem->>'missingSlot')
      );

      v_is_identical := (
        v_existing_answer.is_correct = v_a_is_correct AND
        v_ans_user_ans_equal AND
        v_ans_problem_equal
      );

      IF v_is_identical THEN
        -- Безопасный повтор (идемпотентность): фиксируем исходную строку
        v_synced_answer_ids := array_append(v_synced_answer_ids, v_existing_answer.id);
      ELSE
        -- Конфликт содержимого: номер задачи уже занят другими данными!
        RAISE EXCEPTION 'Integrity conflict: Problem index % in session % is already recorded with different content', v_a_problem_idx, v_a_session_id;
      END IF;

    ELSE
      -- Добавление нового ответа (append-only)
      INSERT INTO public.session_answers (
        id,
        session_id,
        problem_index,
        problem,
        user_answer,
        is_correct,
        response_time_sec,
        difficulty,
        skill_tags,
        answered_at,
        created_at
      ) VALUES (
        v_a_id,
        v_a_session_id,
        v_a_problem_idx,
        v_a_problem,
        v_a_user_answer,
        v_a_is_correct,
        v_a_resp_time,
        v_a_difficulty,
        v_a_skill_tags,
        v_a_answered_at,
        timezone('utc'::text, now())
      );

      v_synced_answer_ids := array_append(v_synced_answer_ids, v_a_id);
      IF NOT (v_a_session_id = ANY(v_touched_sessions)) THEN
        v_touched_sessions := array_append(v_touched_sessions, v_a_session_id);
      END IF;
    END IF;

  END LOOP;

  -- =========================================================================
  -- 7. СЕРВЕРНЫЙ ПЕРЕСЧЁТ АГРЕГАТОВ ДЛЯ ВСЕХ ЗАТРОНУТЫХ СЕССИЙ
  -- =========================================================================
  FOREACH v_curr_sid IN ARRAY v_touched_sessions
  LOOP
    -- Подсчёт решённых, верных и среднего времени ответа
    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct), COALESCE(AVG(response_time_sec), 0.0)
    INTO v_solved_count, v_correct_count, v_avg_time
    FROM public.session_answers
    WHERE session_id = v_curr_sid;

    IF v_solved_count > 0 THEN
      v_accuracy := ROUND((v_correct_count::numeric / v_solved_count::numeric) * 100.0, 2);
      v_avg_time := ROUND(v_avg_time, 2);
    ELSE
      v_accuracy := 0.00;
      v_avg_time := 0.00;
    END IF;

    -- Расчёт максимальной серии (best_streak) с учётом неверных ответов И пропущенных индексов
    v_max_streak := 0;
    v_curr_streak := 0;
    v_prev_idx := 0;

    FOR r_ans IN
      SELECT problem_index, is_correct
      FROM public.session_answers
      WHERE session_id = v_curr_sid
      ORDER BY problem_index ASC
    LOOP
      IF r_ans.is_correct THEN
        IF v_prev_idx = 0 OR r_ans.problem_index = v_prev_idx + 1 THEN
          v_curr_streak := v_curr_streak + 1;
        ELSE
          -- Разрыв в индексах: серия прерывается и начинается заново с 1
          v_curr_streak := 1;
        END IF;
      ELSE
        -- Неверный ответ: серия сбрасывается в 0
        v_curr_streak := 0;
      END IF;

      IF v_curr_streak > v_max_streak THEN
        v_max_streak := v_curr_streak;
      END IF;

      v_prev_idx := r_ans.problem_index;
    END LOOP;

    -- Обновляем агрегаты сессии, НЕ изменяя статус и время завершения
    UPDATE public.training_sessions
    SET solved_problems_count = v_solved_count,
        correct_count = v_correct_count,
        accuracy_percent = v_accuracy,
        avg_response_time_sec = v_avg_time,
        best_streak = v_max_streak,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_curr_sid;
  END LOOP;

  -- 8. Успешный результат пакета
  RETURN jsonb_build_object(
    'status', 'ok',
    'synced_sessions', to_jsonb(v_synced_session_ids),
    'synced_answers', to_jsonb(v_synced_answer_ids)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC PERMISSIONS: REVOKE PUBLIC/ANON, GRANT AUTHENTICATED ONLY
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.sync_telemetry_batch(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_telemetry_batch(JSONB) TO authenticated;
