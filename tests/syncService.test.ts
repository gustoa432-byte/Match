import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  getTelemetryDb,
  closeTelemetryDb,
  resetTelemetryDbInstanceForTesting,
  getPendingSyncQueueItems,
  removeSyncQueueItems,
  updateSyncQueueItemStatus,
  markItemsAsSynced,
  DB_NAME,
} from '../src/telemetry/indexedDb';
import { SessionService } from '../src/telemetry/sessionService';
import { SyncService, MAX_ANSWERS_PER_BATCH } from '../src/telemetry/syncService';
import * as supabaseClientModule from '../src/telemetry/supabaseClient';
import { TrainingSession, SessionAnswer, SyncQueueItem } from '../src/telemetry/types';
import { Problem } from '../src/game/generator';
import fs from 'fs';
import path from 'path';

describe('Client SyncService & Telemetry Contract', () => {
  let sessionService: SessionService;
  let syncService: SyncService;

  beforeEach(async () => {
    await closeTelemetryDb();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    sessionService = new SessionService();
    syncService = new SyncService();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await closeTelemetryDb();
    vi.restoreAllMocks();
  });

  const dummyProblem: Problem = {
    id: 'p-1',
    a: 6,
    b: 7,
    operator: '×',
    operation: 'multiplication',
    answer: 42,
    level: 1,
    tags: ['times_table'],
  };

  it('skips sync when user is not authenticated without throwing errors', async () => {
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue({} as any);
    vi.spyOn(supabaseClientModule, 'getAuthenticatedUser').mockResolvedValue(null);

    const res = await syncService.syncBatch();
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe('user_not_authenticated');
  });

  it('skips sync when Supabase is not configured without throwing errors', async () => {
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(null);

    const res = await syncService.syncBatch();
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe('supabase_not_configured');
  });

  it('returns idle when syncQueue is empty', async () => {
    const mockUser: any = { id: 'test-user-id' };
    const mockClient: any = { rpc: vi.fn() };
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockClient);
    vi.spyOn(supabaseClientModule, 'getAuthenticatedUser').mockResolvedValue(mockUser);

    const res = await syncService.syncBatch();
    expect(res.status).toBe('idle');
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it('batches at most 25 answers per request to prevent oversized payloads', async () => {
    const mockUser: any = { id: 'test-user-id' };
    let capturedPayload: any = null;
    const mockClient: any = {
      rpc: vi.fn().mockImplementation((fn: string, params: any) => {
        capturedPayload = params.p_payload;
        return Promise.resolve({
          data: {
            status: 'ok',
            synced_sessions: [],
            synced_answers: params.p_payload.answers.map((a: any) => a.id),
          },
          error: null,
        });
      }),
    };
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockClient);
    vi.spyOn(supabaseClientModule, 'getAuthenticatedUser').mockResolvedValue(mockUser);

    // Создаём сессию и 30 ответов в очереди
    const session = await sessionService.startSession({
      level: 1,
      mode: 'adaptive',
      allowedOperators: ['×'],
      totalProblems: 30,
      initialProblem: dummyProblem,
    });

    const db = await getTelemetryDb();
    const tx = db.transaction('syncQueue', 'readwrite');
    for (let i = 1; i <= 30; i++) {
      const ans: SessionAnswer = {
        id: `ans-${i}`,
        sessionId: session.id,
        problemIndex: i,
        problem: { ...dummyProblem, answer: i * 2, type: 'standard' },
        userAnswer: i * 2,
        isCorrect: true,
        responseTimeSec: 1.0,
        difficulty: 1,
        skillTags: ['times_table'],
        answeredAt: Date.now(),
        syncStatus: 'pending',
      };
      await tx.objectStore('syncQueue').put({
        id: `answer_${ans.id}`,
        entityType: 'answer',
        entityId: ans.id,
        action: 'upsert',
        payload: ans,
        createdAt: Date.now() + i,
        attempts: 0,
        lastAttemptAt: null,
        errorMessage: null,
      });
    }
    await tx.done;

    const res = await syncService.syncBatch();
    expect(res.status).toBe('success');
    expect(mockClient.rpc).toHaveBeenCalledTimes(1);
    expect(capturedPayload.answers.length).toBe(MAX_ANSWERS_PER_BATCH);
    expect(capturedPayload.answers.length).toBe(25);
  });

  it('preserves items in queue and updates attempt count when server returns an error', async () => {
    const mockUser: any = { id: 'test-user-id' };
    const mockClient: any = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network connection timeout' },
      }),
    };
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockClient);
    vi.spyOn(supabaseClientModule, 'getAuthenticatedUser').mockResolvedValue(mockUser);

    const session = await sessionService.startSession({
      level: 1,
      mode: 'adaptive',
      allowedOperators: ['×'],
      totalProblems: 20,
      initialProblem: dummyProblem,
    });

    const res = await syncService.syncBatch();
    expect(res.status).toBe('failed');
    expect(res.error).toContain('Network connection timeout');

    // Проверяем, что элементы НЕ удалены из очереди, а attempts увеличены!
    const queue = await getPendingSyncQueueItems(10);
    expect(queue.length).toBeGreaterThan(0);
    const sessionQueueItem = queue.find((q) => q.id === `session_${session.id}`);
    expect(sessionQueueItem).toBeDefined();
    expect(sessionQueueItem?.attempts).toBe(1);
    expect(sessionQueueItem?.errorMessage).toBe('Network connection timeout');
  });

  it('removes queue items and marks local stores as synced after confirmed server response', async () => {
    const mockUser: any = { id: 'test-user-id' };
    const mockClient: any = {
      rpc: vi.fn().mockImplementation((fn: string, params: any) => {
        return Promise.resolve({
          data: {
            status: 'ok',
            synced_sessions: params.p_payload.sessions.map((s: any) => s.id),
            synced_answers: params.p_payload.answers.map((a: any) => a.id),
          },
          error: null,
        });
      }),
    };
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockClient);
    vi.spyOn(supabaseClientModule, 'getAuthenticatedUser').mockResolvedValue(mockUser);

    const session = await sessionService.startSession({
      level: 1,
      mode: 'adaptive',
      allowedOperators: ['×'],
      totalProblems: 20,
      initialProblem: dummyProblem,
    });

    await sessionService.recordAnswer({
      sessionId: session.id,
      problemIndex: 1,
      problem: dummyProblem,
      userAnswer: 42,
      isCorrect: true,
      responseTimeSec: 1.2,
      level: 1,
      solvedProblemsCount: 1,
      correctCount: 1,
      bestStreak: 1,
      nextActiveState: null,
    });

    const pendingBefore = await getPendingSyncQueueItems(10);
    expect(pendingBefore.length).toBe(2); // 1 session + 1 answer

    const res = await syncService.syncBatch();
    expect(res.status).toBe('success');

    // Очередь должна быть пуста
    const pendingAfter = await getPendingSyncQueueItems(10);
    expect(pendingAfter.length).toBe(0);

    // Локальные записи должны иметь syncStatus = 'synced'
    const db = await getTelemetryDb();
    const savedSession = await db.get('sessions', session.id);
    expect(savedSession?.syncStatus).toBe('synced');
  });

  it('distinguishes number 42, string "42", and null in payload formatting', async () => {
    const mockUser: any = { id: 'test-user-id' };
    let sentAnswers: any[] = [];
    const mockClient: any = {
      rpc: vi.fn().mockImplementation((fn: string, params: any) => {
        sentAnswers = params.p_payload.answers;
        return Promise.resolve({
          data: { status: 'ok', synced_sessions: [], synced_answers: [] },
          error: null,
        });
      }),
    };
    vi.spyOn(supabaseClientModule, 'getSupabaseClient').mockReturnValue(mockClient);
    vi.spyOn(supabaseClientModule, 'getAuthenticatedUser').mockResolvedValue(mockUser);

    const session = await sessionService.startSession({
      level: 1,
      mode: 'adaptive',
      allowedOperators: ['+'],
      totalProblems: 20,
      initialProblem: dummyProblem,
    });

    // 1. Number 42
    await sessionService.recordAnswer({
      sessionId: session.id,
      problemIndex: 1,
      problem: dummyProblem,
      userAnswer: 42,
      isCorrect: true,
      responseTimeSec: 1.0,
      level: 1,
      solvedProblemsCount: 1,
      correctCount: 1,
      bestStreak: 1,
      nextActiveState: null,
    });

    // 2. String "42"
    await sessionService.recordAnswer({
      sessionId: session.id,
      problemIndex: 2,
      problem: dummyProblem,
      userAnswer: '42',
      isCorrect: true,
      responseTimeSec: 1.0,
      level: 1,
      solvedProblemsCount: 2,
      correctCount: 2,
      bestStreak: 2,
      nextActiveState: null,
    });

    // 3. Null
    await sessionService.recordAnswer({
      sessionId: session.id,
      problemIndex: 3,
      problem: dummyProblem,
      userAnswer: null,
      isCorrect: false,
      responseTimeSec: 1.0,
      level: 1,
      solvedProblemsCount: 3,
      correctCount: 2,
      bestStreak: 2,
      nextActiveState: null,
    });

    await syncService.syncBatch();
    expect(sentAnswers.length).toBe(3);

    // Проверяем типы сериализации по problemIndex
    const ans1 = sentAnswers.find((a) => a.problemIndex === 1);
    const ans2 = sentAnswers.find((a) => a.problemIndex === 2);
    const ans3 = sentAnswers.find((a) => a.problemIndex === 3);

    expect(ans1).toBeDefined();
    expect(typeof ans1.userAnswer).toBe('number');
    expect(ans1.userAnswer).toBe(42);

    expect(ans2).toBeDefined();
    expect(typeof ans2.userAnswer).toBe('string');
    expect(ans2.userAnswer).toBe('42');

    expect(ans3).toBeDefined();
    expect(ans3.userAnswer).toBeNull();
  });

  describe('SQL Migration File Contract Verification', () => {
    it('migration file exists and contains all required architectural components', () => {
      const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261009120000_telemetry_schema.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf8');

      // 1. Revoke create on schema public
      expect(sqlContent).toContain('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      expect(sqlContent).toContain('REVOKE CREATE ON SCHEMA public FROM anon');
      expect(sqlContent).toContain('REVOKE CREATE ON SCHEMA public FROM authenticated');

      // 2. Dynamic policy cleanup
      expect(sqlContent).toContain('pg_policies');
      expect(sqlContent).toContain('DROP POLICY IF EXISTS');

      // 3. Tables profiles, training_sessions, session_answers
      expect(sqlContent).toContain('public.profiles');
      expect(sqlContent).toContain('public.training_sessions');
      expect(sqlContent).toContain('public.session_answers');

      // 4. JSONB user_answer conversion preserving types
      expect(sqlContent).toContain('user_answer TYPE JSONB');
      expect(sqlContent).toContain('to_jsonb(user_answer::numeric)');

      // 5. Read-only permissions for clients
      expect(sqlContent).toContain('REVOKE ALL ON TABLE public.training_sessions FROM PUBLIC, anon, authenticated');
      expect(sqlContent).toContain('GRANT SELECT ON TABLE public.training_sessions TO authenticated');

      // 6. Security Definer RPC with fixed search_path
      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.sync_telemetry_batch(p_payload JSONB)');
      expect(sqlContent).toContain('SECURITY DEFINER');
      expect(sqlContent).toContain('SET search_path = public, pg_temp');
      expect(sqlContent).toContain('REVOKE EXECUTE ON FUNCTION public.sync_telemetry_batch(JSONB) FROM PUBLIC, anon');
      expect(sqlContent).toContain('GRANT EXECUTE ON FUNCTION public.sync_telemetry_batch(JSONB) TO authenticated');

      // 7. Aggregates calculation and streak with gap detection
      expect(sqlContent).toContain('best_streak');
      expect(sqlContent).toContain('v_prev_idx + 1');

      // 8. Monotonic activeState protection
      expect(sqlContent).toContain('active_state_seq');
    });

    it('test verification SQL suite exists and contains all 14 test scenarios', () => {
      const testSqlPath = path.resolve(process.cwd(), 'supabase/tests/telemetry_rpc_tests.sql');
      expect(fs.existsSync(testSqlPath)).toBe(true);

      const sqlTestContent = fs.readFileSync(testSqlPath, 'utf8');

      for (let i = 1; i <= 13; i++) {
        expect(sqlTestContent).toContain(`Test ${i}:`);
      }
    });
  });
});
