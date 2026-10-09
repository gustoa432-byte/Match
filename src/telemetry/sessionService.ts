import { DifficultyLevel, Operator, Problem } from '../game/generator';
import { TrainingMode } from '../components/Header';
import { TaskMetric } from '../game/storage';
import {
  TrainingSession,
  SessionAnswer,
  ActiveSessionState,
} from './types';
import {
  createSessionInDb,
  recordAnswerInDb,
  completeSessionInDb,
  abandonSessionInDb,
  getUnfinishedSessionFromDb,
  getSessionAnswersFromDb,
  RecordAnswerResult,
  isIndexedDbAvailable,
} from './indexedDb';
import { syncService } from './syncService';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SessionService {
  /**
   * Запуск новой тренировочной сессии
   */
  public async startSession(params: {
    level: DifficultyLevel;
    mode: TrainingMode;
    allowedOperators: Operator[];
    totalProblems: number;
    initialProblem: Problem;
    ladderQueue?: Problem[];
  }): Promise<TrainingSession> {
    const sessionId = generateUuid();
    const session: TrainingSession = {
      id: sessionId,
      status: 'in_progress',
      startedAt: Date.now(),
      completedAt: null,
      level: params.level,
      mode: params.mode,
      allowedOperators: [...params.allowedOperators],
      totalProblems: params.totalProblems,
      solvedProblemsCount: 0,
      correctCount: 0,
      accuracyPercent: 0,
      avgResponseTimeSec: 0,
      bestStreak: 0,
      syncStatus: 'pending',
      activeState: {
        problemIndex: 1,
        currentStreak: 0,
        sessionMaxStreak: 0,
        currentProblem: params.initialProblem,
        ladderQueue: params.ladderQueue || [],
        recentProblems: [],
        seq: 1,
      },
    };

    if (isIndexedDbAvailable()) {
      await createSessionInDb(session);
      syncService.triggerSync();
    }

    return session;
  }

  /**
   * Запись ответа на задачу
   */
  public async recordAnswer(params: {
    sessionId: string;
    problemIndex: number;
    problem: Problem;
    userAnswer: number | string | null;
    isCorrect: boolean;
    responseTimeSec: number;
    level: DifficultyLevel;
    solvedProblemsCount: number;
    correctCount: number;
    bestStreak: number;
    nextActiveState: ActiveSessionState | null;
  }): Promise<RecordAnswerResult> {
    const answerId = generateUuid();
    const answer: SessionAnswer = {
      id: answerId,
      sessionId: params.sessionId,
      problemIndex: params.problemIndex,
      problem: {
        a: params.problem.a,
        b: params.problem.b,
        operator: params.problem.operator,
        operation: params.problem.operation,
        answer: params.problem.answer,
        type: params.problem.type || 'standard',
        tags: params.problem.tags,
        proposedAnswer: params.problem.proposedAnswer,
        missingSlot: params.problem.missingSlot,
        estimationRanges: params.problem.estimationRanges,
      },
      userAnswer: params.userAnswer,
      isCorrect: params.isCorrect,
      responseTimeSec: params.responseTimeSec,
      difficulty: params.level,
      skillTags: params.problem.tags,
      answeredAt: Date.now(),
      syncStatus: 'pending',
    };

    if (!isIndexedDbAvailable()) {
      throw new Error('IndexedDB is not available to securely record this answer.');
    }

    const res = await recordAnswerInDb(
      answer,
      {
        solvedProblemsCount: params.solvedProblemsCount,
        correctCount: params.correctCount,
        bestStreak: params.bestStreak,
      },
      params.nextActiveState
    );

    syncService.triggerSync();
    return res;
  }

  /**
   * Успешное завершение сессии
   */
  public async completeSession(
    sessionId: string,
    finalStats: {
      accuracyPercent: number;
      avgResponseTimeSec: number;
      bestStreak: number;
      correctCount: number;
      solvedProblemsCount: number;
    }
  ): Promise<TrainingSession | null> {
    if (!isIndexedDbAvailable()) return null;
    const res = await completeSessionInDb(sessionId, finalStats);
    syncService.triggerSync();
    return res;
  }

  /**
   * Прерывание сессии (пользователь начал новую или сбросил игру)
   */
  public async abandonSession(sessionId: string): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    await abandonSessionInDb(sessionId);
    syncService.triggerSync();
  }

  /**
   * Поиск незавершённой сессии для продолжения
   */
  public async getUnfinishedSession(): Promise<{
    session: TrainingSession;
    answers: SessionAnswer[];
  } | null> {
    if (!isIndexedDbAvailable()) return null;
    const session = await getUnfinishedSessionFromDb();
    if (!session) return null;

    const answers = await getSessionAnswersFromDb(session.id);
    return { session, answers };
  }

  /**
   * Преобразование SessionAnswer в TaskMetric для обратной совместимости с адаптивным движком
   */
  public convertAnswerToTaskMetric(answer: SessionAnswer): TaskMetric {
    return {
      id: answer.id,
      operation: answer.problem.operation,
      operator: answer.problem.operator,
      a: answer.problem.a,
      b: answer.problem.b,
      correctAnswer: answer.problem.answer,
      userAnswer: answer.userAnswer,
      correct: answer.isCorrect,
      responseTime: answer.responseTimeSec,
      difficulty: answer.difficulty,
      skillTags: answer.skillTags,
      timestamp: answer.answeredAt,
    };
  }
}

export const sessionService = new SessionService();
