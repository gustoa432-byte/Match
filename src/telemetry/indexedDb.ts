import { openDB, IDBPDatabase } from 'idb';
import { TrainingSession, SessionAnswer, SyncQueueItem, ActiveSessionState } from './types';

export const DB_NAME = 'match_telemetry_db';
export const DB_VERSION = 1;

export interface MatchDbSchema {
  sessions: {
    key: string;
    value: TrainingSession;
    indexes: {
      status: string;
      startedAt: number;
    };
  };
  answers: {
    key: string;
    value: SessionAnswer;
    indexes: {
      sessionId: string;
      sessionId_problemIndex: [string, number];
      answeredAt: number;
    };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      entityType: string;
      createdAt: number;
    };
  };
}

let dbInstancePromise: Promise<IDBPDatabase<MatchDbSchema>> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function getTelemetryDb(): Promise<IDBPDatabase<MatchDbSchema>> {
  if (!isIndexedDbAvailable()) {
    throw new Error('IndexedDB is not supported or unavailable in this environment.');
  }

  if (!dbInstancePromise) {
    dbInstancePromise = openDB<MatchDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Хранилище сессий
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('status', 'status');
          sessionStore.createIndex('startedAt', 'startedAt');
        }

        // 2. Хранилище ответов
        if (!db.objectStoreNames.contains('answers')) {
          const answerStore = db.createObjectStore('answers', { keyPath: 'id' });
          answerStore.createIndex('sessionId', 'sessionId');
          // Уникальный составной индекс [sessionId, problemIndex]
          answerStore.createIndex('sessionId_problemIndex', ['sessionId', 'problemIndex'], {
            unique: true,
          });
          answerStore.createIndex('answeredAt', 'answeredAt');
        }

        // 3. Хранилище очереди синхронизации
        if (!db.objectStoreNames.contains('syncQueue')) {
          const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          queueStore.createIndex('entityType', 'entityType');
          queueStore.createIndex('createdAt', 'createdAt');
        }
      },
    });
  }

  return dbInstancePromise;
}

/**
 * Создание новой тренировочной сессии с фиксацией в очереди синхронизации
 */
export async function createSessionInDb(session: TrainingSession): Promise<void> {
  const db = await getTelemetryDb();
  const tx = db.transaction(['sessions', 'syncQueue'], 'readwrite');

  await tx.objectStore('sessions').put(session);

  const queueItem: SyncQueueItem = {
    id: `session_${session.id}`,
    entityType: 'session',
    entityId: session.id,
    action: 'upsert',
    payload: session,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
  };
  await tx.objectStore('syncQueue').put(queueItem);

  await tx.done;
}

export type RecordAnswerResult =
  | { status: 'recorded'; answer: SessionAnswer }
  | { status: 'idempotent_duplicate'; answer: SessionAnswer };

/**
 * Атомарная запись ответа с контролем идемпотентности и обновлением сессии
 */
export async function recordAnswerInDb(
  answer: SessionAnswer,
  sessionUpdate: {
    solvedProblemsCount: number;
    correctCount: number;
    bestStreak: number;
  },
  newActiveState: ActiveSessionState | null
): Promise<RecordAnswerResult> {
  const db = await getTelemetryDb();
  const tx = db.transaction(['answers', 'sessions', 'syncQueue'], 'readwrite');

  const answersStore = tx.objectStore('answers');
  const sessionsStore = tx.objectStore('sessions');
  const syncQueueStore = tx.objectStore('syncQueue');

  // 1. Проверяем составной индекс [sessionId, problemIndex]
  const existing = await answersStore
    .index('sessionId_problemIndex')
    .get([answer.sessionId, answer.problemIndex]);

  if (existing) {
    // Проверка на идентичность ответа
    const isIdentical =
      existing.isCorrect === answer.isCorrect &&
      String(existing.userAnswer) === String(answer.userAnswer) &&
      existing.problem.a === answer.problem.a &&
      existing.problem.b === answer.problem.b &&
      existing.problem.operator === answer.problem.operator;

    if (isIdentical) {
      await tx.done;
      return { status: 'idempotent_duplicate', answer: existing };
    } else {
      // Конфликт содержимого: номер задачи уже занят другим ответом
      try {
        tx.abort();
      } catch {
        // ignore
      }
      await tx.done.catch(() => {});
      throw new Error(
        `Integrity conflict: Problem index ${answer.problemIndex} in session ${answer.sessionId} is already recorded with different content.`
      );
    }
  }

  // 2. Получаем родительскую сессию
  const session = await sessionsStore.get(answer.sessionId);
  if (!session) {
    try {
      tx.abort();
    } catch {
      // ignore
    }
    await tx.done.catch(() => {});
    throw new Error(`Integrity error: Training session ${answer.sessionId} not found.`);
  }

  // 3. Сохраняем ответ
  await answersStore.put(answer);

  // 4. Обновляем счётчики и активный снимок сессии
  session.solvedProblemsCount = sessionUpdate.solvedProblemsCount;
  session.correctCount = sessionUpdate.correctCount;
  session.bestStreak = sessionUpdate.bestStreak;
  session.accuracyPercent =
    session.solvedProblemsCount > 0
      ? Math.round((session.correctCount / session.solvedProblemsCount) * 100)
      : 0;
  session.activeState = newActiveState;
  await sessionsStore.put(session);

  // 5. Постановка в очередь синхронизации (дедуплицированная по ID)
  const answerQueueItem: SyncQueueItem = {
    id: `answer_${answer.id}`,
    entityType: 'answer',
    entityId: answer.id,
    action: 'upsert',
    payload: answer,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
  };
  await syncQueueStore.put(answerQueueItem);

  const sessionQueueItem: SyncQueueItem = {
    id: `session_${session.id}`,
    entityType: 'session',
    entityId: session.id,
    action: 'upsert',
    payload: session,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
  };
  await syncQueueStore.put(sessionQueueItem);

  await tx.done;
  return { status: 'recorded', answer };
}

/**
 * Завершение сессии (completed)
 */
export async function completeSessionInDb(
  sessionId: string,
  finalStats: {
    accuracyPercent: number;
    avgResponseTimeSec: number;
    bestStreak: number;
    correctCount: number;
    solvedProblemsCount: number;
  }
): Promise<TrainingSession> {
  const db = await getTelemetryDb();
  const tx = db.transaction(['sessions', 'syncQueue'], 'readwrite');

  const session = await tx.objectStore('sessions').get(sessionId);
  if (!session) {
    try {
      tx.abort();
    } catch {
      // ignore
    }
    await tx.done.catch(() => {});
    throw new Error(`Session ${sessionId} not found.`);
  }

  session.status = 'completed';
  session.completedAt = Date.now();
  session.accuracyPercent = finalStats.accuracyPercent;
  session.avgResponseTimeSec = finalStats.avgResponseTimeSec;
  session.bestStreak = finalStats.bestStreak;
  session.correctCount = finalStats.correctCount;
  session.solvedProblemsCount = finalStats.solvedProblemsCount;
  session.activeState = null;

  await tx.objectStore('sessions').put(session);

  const sessionQueueItem: SyncQueueItem = {
    id: `session_${session.id}`,
    entityType: 'session',
    entityId: session.id,
    action: 'upsert',
    payload: session,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
  };
  await tx.objectStore('syncQueue').put(sessionQueueItem);

  await tx.done;
  return session;
}

/**
 * Прерывание сессии (abandoned)
 */
export async function abandonSessionInDb(sessionId: string): Promise<void> {
  const db = await getTelemetryDb();
  const tx = db.transaction(['sessions', 'syncQueue'], 'readwrite');

  const session = await tx.objectStore('sessions').get(sessionId);
  if (!session) {
    try {
      tx.abort();
    } catch {
      // ignore
    }
    await tx.done.catch(() => {});
    return;
  }

  session.status = 'abandoned';
  session.completedAt = Date.now();
  session.activeState = null;

  await tx.objectStore('sessions').put(session);

  const sessionQueueItem: SyncQueueItem = {
    id: `session_${session.id}`,
    entityType: 'session',
    entityId: session.id,
    action: 'upsert',
    payload: session,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
  };
  await tx.objectStore('syncQueue').put(sessionQueueItem);

  await tx.done;
}

/**
 * Получение самой актуальной незавершённой сессии (in_progress)
 */
export async function getUnfinishedSessionFromDb(): Promise<TrainingSession | null> {
  if (!isIndexedDbAvailable()) return null;
  const db = await getTelemetryDb();
  const inProgressList = await db.getAllFromIndex('sessions', 'status', 'in_progress');
  if (!inProgressList || inProgressList.length === 0) return null;

  // Сортируем по времени старта (наиболее свежая последняя)
  inProgressList.sort((a, b) => b.startedAt - a.startedAt);
  return inProgressList[0];
}

/**
 * Получение всех сохранённых ответов для сессии
 */
export async function getSessionAnswersFromDb(sessionId: string): Promise<SessionAnswer[]> {
  if (!isIndexedDbAvailable()) return [];
  const db = await getTelemetryDb();
  const answers = await db.getAllFromIndex('answers', 'sessionId', sessionId);
  answers.sort((a, b) => a.problemIndex - b.problemIndex);
  return answers;
}

/**
 * Закрытие соединения с базой данных
 */
export async function closeTelemetryDb(): Promise<void> {
  if (dbInstancePromise) {
    try {
      const db = await dbInstancePromise;
      db.close();
    } catch {
      // ignore
    }
    dbInstancePromise = null;
  }
}

/**
 * Сброс инстанса соединения (для тестов)
 */
export function resetTelemetryDbInstanceForTesting(): void {
  dbInstancePromise = null;
}
