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
        mode: 'ladder',
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

  describe('Task 1: Idempotency & Conflict Semantics', () => {
    it('allows identical retry with different responseTimeSec or answerId without duplicate or conflict', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      // Первый вызов (исходная фиксация)
      const first = await sessionService.recordAnswer({
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
        nextActiveState: null,
      });

      expect(first.status).toBe('recorded');

      // Повторный вызов: то же выражение и ответ, но latency иная (напр. 2.90с из-за задержки сети или повторной отправки)
      const retry = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 2.9, // Изменённый responseTimeSec НЕ должен быть конфликтом!
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      expect(retry.status).toBe('idempotent_duplicate');
      expect(retry.answer.id).toBe(first.answer.id);

      const db = await getTelemetryDb();
      const allAnswers = await db.getAll('answers');
      expect(allAnswers).toHaveLength(1);
      expect(allAnswers[0].id).toBe(first.answer.id);

      // Счётчики сессии в базе НЕ должны были удвоиться
      const currentSession = await db.get('sessions', session.id);
      expect(currentSession?.solvedProblemsCount).toBe(1);
      expect(currentSession?.correctCount).toBe(1);
    });

    it('rejects differing userAnswer with Integrity conflict error', async () => {
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
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 50, // Другой ответ
          isCorrect: false,
          responseTimeSec: 1.2,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 0,
          bestStreak: 0,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);
    });

    it('rejects differing isCorrect with Integrity conflict error', async () => {
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
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 56,
          isCorrect: false, // Конфликт флага правильности
          responseTimeSec: 1.2,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 0,
          bestStreak: 0,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);
    });

    it('rejects differing problem operands or answer with Integrity conflict error', async () => {
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
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      const differentProblem: Problem = {
        ...dummyProblem,
        a: 8,
        answer: 64,
      };

      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: differentProblem,
          userAnswer: 56,
          isCorrect: true,
          responseTimeSec: 1.2,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 1,
          bestStreak: 1,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);
    });

    it('rejects differing true_false proposedAnswer with Integrity conflict error', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'true_false',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const tfProblem1: Problem = {
        id: 'tf-1',
        a: 4,
        b: 5,
        operator: '+',
        operation: 'addition',
        answer: 9,
        level: 1,
        tags: [],
        type: 'true_false',
        proposedAnswer: 9, // "4 + 5 = 9"
      };

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: tfProblem1,
        userAnswer: 'Верно',
        isCorrect: true,
        responseTimeSec: 1.0,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      // Повтор того же problemIndex, но с другим proposedAnswer ("4 + 5 = 10")
      const tfProblem2: Problem = {
        ...tfProblem1,
        proposedAnswer: 10,
      };

      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: tfProblem2,
          userAnswer: 'Верно',
          isCorrect: true,
          responseTimeSec: 1.0,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 1,
          bestStreak: 1,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);
    });

    it('rejects differing missing_number missingSlot with Integrity conflict error', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'missing_number',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const mnProblem1: Problem = {
        id: 'mn-1',
        a: 3,
        b: 7,
        operator: '+',
        operation: 'addition',
        answer: 10,
        level: 1,
        tags: [],
        type: 'missing_number',
        missingSlot: 'a', // "? + 7 = 10"
      };

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: mnProblem1,
        userAnswer: 3,
        isCorrect: true,
        responseTimeSec: 1.0,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      // Повтор с missingSlot 'b' ("3 + ? = 10")
      const mnProblem2: Problem = {
        ...mnProblem1,
        missingSlot: 'b',
      };

      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: mnProblem2,
          userAnswer: 3,
          isCorrect: true,
          responseTimeSec: 1.0,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 1,
          bestStreak: 1,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);
    });

    it('rejects null vs "null" string collision for userAnswer', async () => {
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
        userAnswer: null, // Исходно значение null
        isCorrect: false,
        responseTimeSec: 1.0,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 0,
        bestStreak: 0,
        nextActiveState: null,
      });

      await expect(
        sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 'null', // Строка 'null'
          isCorrect: false,
          responseTimeSec: 1.0,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 0,
          bestStreak: 0,
          nextActiveState: null,
        })
      ).rejects.toThrow(/Integrity conflict/);
    });

    it('ensures DB state, session counters, and syncQueue are completely unmodified after conflict', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      // Исходный валидный ответ
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

      const db = await getTelemetryDb();
      const sessionBefore = await db.get('sessions', session.id);
      const answersBefore = await db.getAll('answers');
      const queueBefore = await db.getAll('syncQueue');

      // Пытаемся записать конфликт
      try {
        await sessionService.recordAnswer({
          sessionId: session.id,
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 99, // Конфликт
          isCorrect: false,
          responseTimeSec: 5.0,
          level: 1,
          solvedProblemsCount: 2,
          correctCount: 1,
          bestStreak: 1,
          nextActiveState: null,
        });
      } catch (err) {
        // Ожидаемый конфликт
      }

      const sessionAfter = await db.get('sessions', session.id);
      const answersAfter = await db.getAll('answers');
      const queueAfter = await db.getAll('syncQueue');

      // База осталась абсолютно нетронутой:
      expect(sessionAfter?.solvedProblemsCount).toBe(sessionBefore?.solvedProblemsCount);
      expect(sessionAfter?.correctCount).toBe(sessionBefore?.correctCount);
      expect(answersAfter).toEqual(answersBefore);
      expect(queueAfter).toEqual(queueBefore);
    });
  });

  describe('Task 2: Atomicity & Failure Handling', () => {
    it('transaction rollback leaves no partial state in answers, sessions or syncQueue', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const db = await getTelemetryDb();
      const tx = db.transaction(['answers', 'sessions', 'syncQueue'], 'readwrite');

      const mockAnswer: SessionAnswer = {
        id: 'partial-ans-id',
        sessionId: session.id,
        problemIndex: 1,
        problem: {
          a: 7,
          b: 8,
          operator: '×',
          operation: 'multiplication',
          answer: 56,
          type: 'standard',
          tags: [],
        },
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.0,
        difficulty: 1,
        skillTags: [],
        answeredAt: Date.now(),
        syncStatus: 'pending',
      };

      await tx.objectStore('answers').put(mockAnswer);
      session.solvedProblemsCount = 99; // Попытка частичной модификации
      await tx.objectStore('sessions').put(session);

      // Имитируем сбой посреди транзакции: принудительный откат
      tx.abort();
      await tx.done.catch(() => {});

      // Проверяем, что ничего не зафиксировалось
      const savedAnswer = await db.get('answers', 'partial-ans-id');
      expect(savedAnswer).toBeUndefined();

      const savedSession = await db.get('sessions', session.id);
      expect(savedSession?.solvedProblemsCount).toBe(0);
    });

    it('retry after a failure does not double counters in session', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      // 1. Попытка записи с ошибкой (например, обращение к несуществующей сессии)
      await expect(
        sessionService.recordAnswer({
          sessionId: 'non-existent-session-id',
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 56,
          isCorrect: true,
          responseTimeSec: 1.0,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 1,
          bestStreak: 1,
          nextActiveState: null,
        })
      ).rejects.toThrow();

      // Счётчик реальной сессии всё ещё 0
      const db = await getTelemetryDb();
      let savedSession = await db.get('sessions', session.id);
      expect(savedSession?.solvedProblemsCount).toBe(0);

      // 2. Повторная отправка в правильную сессию
      const successResult = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.0,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      expect(successResult.status).toBe('recorded');

      savedSession = await db.get('sessions', session.id);
      expect(savedSession?.solvedProblemsCount).toBe(1);
      expect(savedSession?.correctCount).toBe(1);
    });

    it('error propagation prevents advancement: recordAnswer rejects and halts execution', async () => {
      let isProblemAdvanced = false;
      let caughtErrorMessage = '';

      try {
        await sessionService.recordAnswer({
          sessionId: 'broken-session',
          problemIndex: 1,
          problem: dummyProblem,
          userAnswer: 56,
          isCorrect: true,
          responseTimeSec: 1.0,
          level: 1,
          solvedProblemsCount: 1,
          correctCount: 1,
          bestStreak: 1,
          nextActiveState: null,
        });
        // Если бы вызов не упал, код продвинулся бы дальше:
        isProblemAdvanced = true;
      } catch (err: any) {
        caughtErrorMessage = err?.message;
      }

      expect(isProblemAdvanced).toBe(false);
      expect(caughtErrorMessage).toMatch(/Integrity error/);
    });

    it('idempotent_duplicate does not throw or block gameplay, returning valid TaskMetric', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const first = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.0,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      // Повторный идентичный вызов
      const duplicate = await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.0,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: null,
      });

      expect(duplicate.status).toBe('idempotent_duplicate');

      // Преобразование в TaskMetric проходит успешно без исключений
      const metric = sessionService.convertAnswerToTaskMetric(duplicate.answer);
      expect(metric).toBeDefined();
      expect(metric.id).toBe(first.answer.id);
      expect(metric.correct).toBe(true);
      expect(metric.userAnswer).toBe(56);
    });
  });

  describe('Task 3: Recovery Across All Training Modes', () => {
    it('saves and restores mode "adaptive" with active problem, streak, and recentProblems', async () => {
      const session = await sessionService.startSession({
        level: 1,
        mode: 'adaptive',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: dummyProblem,
      });

      const nextProblem: Problem = {
        id: 'p-2',
        a: 12,
        b: 15,
        operator: '+',
        operation: 'addition',
        answer: 27,
        level: 1,
        tags: ['two_digit'],
      };

      const activeState: ActiveSessionState = {
        problemIndex: 2,
        currentStreak: 1,
        sessionMaxStreak: 1,
        currentProblem: nextProblem,
        recentProblems: [dummyProblem],
      };

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: dummyProblem,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.5,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: activeState,
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished).not.toBeNull();
      expect(unfinished?.session.mode).toBe('adaptive');
      expect(unfinished?.session.activeState?.problemIndex).toBe(2);
      expect(unfinished?.session.activeState?.currentStreak).toBe(1);
      expect(unfinished?.session.activeState?.currentProblem.id).toBe('p-2');
      expect(unfinished?.session.activeState?.recentProblems).toHaveLength(1);
      expect(unfinished?.answers).toHaveLength(1);
    });

    it('saves and restores mode "true_false" with proposedAnswer preserved in currentProblem', async () => {
      const tfCurrent: Problem = {
        id: 'tf-p1',
        a: 6,
        b: 7,
        operator: '×',
        operation: 'multiplication',
        answer: 42,
        level: 1,
        tags: [],
        type: 'true_false',
        proposedAnswer: 48, // неверное уравнение: 6 × 7 = 48
      };

      const session = await sessionService.startSession({
        level: 1,
        mode: 'true_false',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: tfCurrent,
      });

      const tfNext: Problem = {
        id: 'tf-p2',
        a: 8,
        b: 9,
        operator: '×',
        operation: 'multiplication',
        answer: 72,
        level: 1,
        tags: [],
        type: 'true_false',
        proposedAnswer: 72, // верное уравнение: 8 × 9 = 72
      };

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: tfCurrent,
        userAnswer: 'Неверно',
        isCorrect: true,
        responseTimeSec: 2.1,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: tfNext,
        },
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished?.session.mode).toBe('true_false');
      expect(unfinished?.session.activeState?.currentProblem.type).toBe('true_false');
      expect(unfinished?.session.activeState?.currentProblem.proposedAnswer).toBe(72);
      expect(unfinished?.answers[0].userAnswer).toBe('Неверно');
    });

    it('saves and restores mode "missing_operator" with operator answers preserved', async () => {
      const moCurrent: Problem = {
        id: 'mo-p1',
        a: 35,
        b: 5,
        operator: '÷',
        operation: 'division',
        answer: 7,
        level: 1,
        tags: [],
        type: 'missing_operator',
      };

      const session = await sessionService.startSession({
        level: 1,
        mode: 'missing_operator',
        allowedOperators: ['÷'],
        totalProblems: 20,
        initialProblem: moCurrent,
      });

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: moCurrent,
        userAnswer: '÷',
        isCorrect: true,
        responseTimeSec: 1.8,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: { ...moCurrent, id: 'mo-p2' },
        },
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished?.session.mode).toBe('missing_operator');
      expect(unfinished?.session.activeState?.currentProblem.type).toBe('missing_operator');
      expect(unfinished?.answers[0].userAnswer).toBe('÷');
    });

    it('saves and restores mode "missing_number" with missingSlot "a" or "b" preserved', async () => {
      const mnCurrent: Problem = {
        id: 'mn-p1',
        a: 14,
        b: 8,
        operator: '+',
        operation: 'addition',
        answer: 22,
        level: 1,
        tags: [],
        type: 'missing_number',
        missingSlot: 'a', // "? + 8 = 22"
      };

      const session = await sessionService.startSession({
        level: 1,
        mode: 'missing_number',
        allowedOperators: ['+'],
        totalProblems: 20,
        initialProblem: mnCurrent,
      });

      const mnNext: Problem = {
        id: 'mn-p2',
        a: 15,
        b: 7,
        operator: '−',
        operation: 'subtraction',
        answer: 8,
        level: 1,
        tags: [],
        type: 'missing_number',
        missingSlot: 'b', // "15 - ? = 8"
      };

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: mnCurrent,
        userAnswer: 14,
        isCorrect: true,
        responseTimeSec: 1.4,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: mnNext,
        },
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished?.session.mode).toBe('missing_number');
      expect(unfinished?.session.activeState?.currentProblem.missingSlot).toBe('b');
      expect(unfinished?.answers[0].problem.missingSlot).toBe('a');
    });

    it('saves and restores mode "ladder" with remaining ladderQueue preserved in exact order', async () => {
      const ladderP1: Problem = { ...dummyProblem, id: 'lad-1' };
      const ladderP2: Problem = { ...dummyProblem, id: 'lad-2' };
      const ladderP3: Problem = { ...dummyProblem, id: 'lad-3' };
      const ladderP4: Problem = { ...dummyProblem, id: 'lad-4' };

      const session = await sessionService.startSession({
        level: 1,
        mode: 'ladder',
        allowedOperators: ['+'],
        totalProblems: 5,
        initialProblem: ladderP1,
        ladderQueue: [ladderP2, ladderP3, ladderP4],
      });

      expect(session.activeState?.ladderQueue).toHaveLength(3);

      // Решаем lad-1, следующая задача - lad-2, в очереди остаются lad-3, lad-4
      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: ladderP1,
        userAnswer: 56,
        isCorrect: true,
        responseTimeSec: 1.2,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: ladderP2,
          ladderQueue: [ladderP3, ladderP4],
        },
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished?.session.mode).toBe('ladder');
      expect(unfinished?.session.activeState?.currentProblem.id).toBe('lad-2');
      expect(unfinished?.session.activeState?.ladderQueue).toHaveLength(2);
      expect(unfinished?.session.activeState?.ladderQueue?.[0].id).toBe('lad-3');
      expect(unfinished?.session.activeState?.ladderQueue?.[1].id).toBe('lad-4');
    });

    it('saves and restores mode "estimation" with estimationRanges preserved in currentProblem', async () => {
      const estProblem: Problem = {
        id: 'est-p1',
        a: 38,
        b: 42,
        operator: '×',
        operation: 'multiplication',
        answer: 1596,
        level: 2,
        tags: [],
        type: 'estimation',
        estimationRanges: [
          { label: '800 – 1 200', min: 800, max: 1200, isCorrect: false },
          { label: '1 200 – 1 600', min: 1200, max: 1600, isCorrect: true },
          { label: '1 600 – 2 000', min: 1600, max: 2000, isCorrect: false },
          { label: '2 000 – 2 400', min: 2000, max: 2400, isCorrect: false },
        ],
      };

      const session = await sessionService.startSession({
        level: 2,
        mode: 'estimation',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: estProblem,
      });

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: estProblem,
        userAnswer: '1 200 – 1 600',
        isCorrect: true,
        responseTimeSec: 3.4,
        level: 2,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: estProblem,
        },
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished?.session.mode).toBe('estimation');
      expect(unfinished?.session.activeState?.currentProblem.type).toBe('estimation');
      expect(unfinished?.session.activeState?.currentProblem.estimationRanges).toHaveLength(4);
      expect(unfinished?.session.activeState?.currentProblem.estimationRanges?.[1].isCorrect).toBe(true);
      expect(unfinished?.answers[0].userAnswer).toBe('1 200 – 1 600');
    });

    it('saves and restores mode "audio" with speech parameters preserved', async () => {
      const audioProblem: Problem = {
        id: 'aud-p1',
        a: 15,
        b: 6,
        operator: '×',
        operation: 'multiplication',
        answer: 90,
        level: 1,
        tags: ['times_table'],
      };

      const session = await sessionService.startSession({
        level: 1,
        mode: 'audio',
        allowedOperators: ['×'],
        totalProblems: 20,
        initialProblem: audioProblem,
      });

      await sessionService.recordAnswer({
        sessionId: session.id,
        problemIndex: 1,
        problem: audioProblem,
        userAnswer: 90,
        isCorrect: true,
        responseTimeSec: 2.5,
        level: 1,
        solvedProblemsCount: 1,
        correctCount: 1,
        bestStreak: 1,
        nextActiveState: {
          problemIndex: 2,
          currentStreak: 1,
          sessionMaxStreak: 1,
          currentProblem: { ...audioProblem, id: 'aud-p2', a: 16 },
        },
      });

      const unfinished = await sessionService.getUnfinishedSession();
      expect(unfinished?.session.mode).toBe('audio');
      expect(unfinished?.session.activeState?.currentProblem.id).toBe('aud-p2');
      expect(unfinished?.session.activeState?.currentProblem.a).toBe(16);
      expect(unfinished?.answers[0].userAnswer).toBe(90);
    });
  });
});
