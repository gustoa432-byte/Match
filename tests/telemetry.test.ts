import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  getTelemetryDb,
  createSessionInDb,
  recordAnswerInDb,
  completeSessionInDb,
  abandonSessionInDb,
  getUnfinishedSessionFromDb,
  getSessionAnswersFromDb,
  closeTelemetryDb,
  resetTelemetryDbInstanceForTesting,
  DB_NAME,
} from '../src/telemetry/indexedDb';
import { SessionService } from '../src/telemetry/sessionService';
import { TrainingSession, SessionAnswer, ActiveSessionState } from '../src/telemetry/types';
import { Problem } from '../src/game/generator';

describe('Local Telemetry & IndexedDB Storage', () => {
  let sessionService: SessionService;

  beforeEach(async () => {
    await closeTelemetryDb();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    sessionService = new SessionService();
  });

  afterEach(async () => {
    await closeTelemetryDb();
  });

  const dummyProblem: Problem = {
    id: 'p-1',
    a: 7,
    b: 8,
    operator: '×',
    operation: 'multiplication',
    answer: 56,
    level: 1,
    tags: ['times_table'],
  };

  describe('Session Creation and Lifecycle', () => {
    it('creates an in_progress session and enqueues sync item', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['+', '−', '×', '÷'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('in_progress');
      expect(session.solvedProblemsCount).toBe(0);
      expect(session.activeState?.problemIndex).toBe(1);

      const db = await getTelemetryDb();
      const saved = await db.get('sessions', session.id);
      expect(saved).toBeDefined();
      expect(saved?.status).toBe('in_progress');

      // Проверка очереди синхронизации
      const queueItems = await db.getAll('syncQueue');
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0].id).toBe(`session_${session.id}`);
      expect(queueItems[0].entityType).toBe('session');
    });

    it('transitions session to completed with final statistics', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const completed = await sessionService.completeSession(session.id, {
        accuracyPercent: 95,
        avgResponseTimeSec: 1.85,
        bestStreak: 12,
        correctCount: 19,
        solvedProblemsCount: 20,
      });

      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeGreaterThan(0);
      expect(completed?.accuracyPercent).toBe(95);
      expect(completed?.bestStreak).toBe(12);
      expect(completed?.activeState).toBeNull();

      const db = await getTelemetryDb();
      const saved = await db.get('sessions', session.id);
      expect(saved?.status).toBe('completed');
      expect(saved?.activeState).toBeNull();
    });

    it('transitions session to abandoned without deleting answers', async () => {
      const session = await sessionService.startSession({
        level: 2,
        mode: 'sprint' as any,
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.5,
        level: 2,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      await sessionService.abandonSession(session.id);

      const db = await getTelemetryDb();
      const savedSession = await db.get('sessions', session.id);
      expect(savedSession?.status).toBe('abandoned');

      // Ответы ДОЛЖНЫ остаться нетронутыми!
      const answers = await getSessionAnswersFromDb(session.id);
      expect(answers).toHaveLength(1);
      expect(answers[0].userAnswer).toBe(56);
    });
  });

  describe('Atomic Answer Recording and Idempotency', () => {
    it('records an answer, updates session running metrics and syncQueue atomically', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const nextActive: ActiveSessionState = {
        problemIndex: 2,
        currentStreak: 1,
        sessionMaxStreak: 1,
        currentProblem: dummyProblem,
      };

      const result = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.25,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: nextActive,
      });

      expect(result.status).toBe('recorded');
      expect(result.answer.problemIndex).toBe(1);

      const db = await getTelemetryDb();
      const savedSession = await db.get('sessions', session.id);
      expect(savedSession?.solvedProblemsCount).toBe(1);
      expect(savedSession?.correctCount).toBe(1);
      expect(savedSession?.activeState?.problemIndex).toBe(2);

      const savedAnswer = await db.get('answers', result.answer.id);
      expect(savedAnswer).toBeDefined();
      expect(savedAnswer?.isCorrect).toBe(true);

      // Проверка очереди: сессия и ответ
      const queue = await db.getAll('syncQueue');
      const sessionQueueItem = queue.find((q) => q.id === `session_${session.id}`);
      const answerQueueItem = queue.find((q) => q.id === `answer_${result.answer.id}`);
      expect(sessionQueueItem).toBeDefined();
      expect(answerQueueItem).toBeDefined();
    });

    it('handles identical re-submission idempotently without error or duplication', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      // Первый вызов
      const first = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      expect(first.status).toBe('recorded');

      // Повторный вызов с теми же параметрами (напр. двойной клик)
      const second = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      expect(second.status).toBe('idempotent_duplicate');
      expect(second.answer.id).toBe(first.answer.id);

      const db = await getTelemetryDb();
      const allAnswers = await db.getAll('answers');
      // В базе должен остаться ровно один ответ
      expect(allAnswers).toHaveLength(1);
    });

    it('throws explicit integrity error when same problemIndex is submitted with different answer', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      // Первый ответ: верный
      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      // Конфликтующий повторный ответ на тот же номер задачи с другим результатом
      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 50, // конфликт!
          isCorrect: false, // конфликт!
          responseTimeSec: 3.5,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 0,
          bestStreak: 0,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);

      // Исходный ответ остался неизменным
      const answers = await getSessionAnswersFromDb(session.id);
      expect(answers).toHaveLength(1);
      expect(answers[0].userAnswer).toBe(56);
      expect(answers[0].isCorrect).toBe(true);
    });

    it('prevents syncQueue item duplication across multiple updates of the same session', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      // Делаем 3 ответа подряд в одной сессии
      for (let i = 1; i <= 3; i++) {
        await sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: i,
          problem: { ...dummyProblem, a: i },
          userAnswer: i * 8,
          isCorrect: true,
          responseTimeSec: 1.0,
          level: 1,
          solvedProblemsCount: i,
          correctCount: i,
          bestStreak: i,
          nextActiveState: null,
        });
      }

      const db = await getTelemetryDb();
      const queue = await db.getAll('syncQueue');
      // В очереди должно быть ровно 3 элемента для ответов и ровно 1 элемент для сессии (не 4 и не 10!)
      const sessionItems = queue.filter((q) => q.entityType === 'session');
      const answerItems = queue.filter((q) => q.entityType === 'answer');

      expect(sessionItems).toHaveLength(1);
      expect(answerItems).toHaveLength(3);
    });
  });

  describe('Session Recovery', () => {
    it('detects unfinished in_progress session on startup and loads all its answers', async () => {
      const session = await sessionService.startSession({
        level: 2,
        mode: 'ladder',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.1,
        level: 2,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: { ...dummyProblem, a: 8 },
        },
      });

      // Эмулируем перезапуск приложения: новый сервис опрашивает DB
      const freshService = new SessionService();
      const unfinished = await freshService.getUnfinishedSession();

      expect(unfinished).not.toBeNull();
      expect(unfinished?.session.id).toBe(session.id);
      expect(unfinished?.session.level).toBe(2);
      expect(unfinished?.session.mode).toBe('ladder');
      expect(unfinished?.session.activeState?.problemIndex).toBe(2);
      expect(unfinished?.answers).toHaveLength(1);
      expect(unfinished?.answers[0].problemIndex).toBe(1);
    });

    it('returns null if there are no in_progress sessions (e.g. only completed or abandoned)', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });
      await sessionService.completeSession(session.id, {
        accuracyPercent: 100,
        avgResponseTimeSec: 1.0,
        bestStreak: 1,
        correctCount: 1,
        solvedProblemsCount: 1,
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished).toBeNull();
    });
  });
});
