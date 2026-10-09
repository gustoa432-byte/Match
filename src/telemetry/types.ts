import { DifficultyLevel, Operator, OperationName, Problem } from '../game/generator';
import { SkillTag } from '../game/tagger';
import { TrainingMode } from '../components/Header';

export type ProblemType = 'standard' | 'true_false' | 'missing_operator' | 'missing_number' | 'estimation';
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';
export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface ActiveSessionState {
  problemIndex: number;
  currentStreak: number;
  sessionMaxStreak: number;
  currentProblem: Problem;
  ladderQueue?: Problem[];
  recentProblems?: Problem[];
}

export interface TrainingSession {
  id: string; // UUID v4
  status: SessionStatus;
  startedAt: number; // Unix epoch ms
  completedAt: number | null; // Unix epoch ms
  level: DifficultyLevel;
  mode: TrainingMode;
  allowedOperators: Operator[];
  totalProblems: number;
  solvedProblemsCount: number;
  correctCount: number;
  accuracyPercent: number; // 0..100
  avgResponseTimeSec: number;
  bestStreak: number;
  syncStatus: SyncStatus;
  activeState: ActiveSessionState | null;
}

export interface SessionAnswer {
  id: string; // UUID v4
  sessionId: string; // FK -> TrainingSession.id
  problemIndex: number; // 1-based index
  problem: {
    a: number;
    b: number;
    operator: Operator;
    operation: OperationName;
    answer: number;
    type: ProblemType;
    tags: SkillTag[];
    proposedAnswer?: number;
    missingSlot?: 'a' | 'b';
    estimationRanges?: { label: string; min: number; max: number; isCorrect: boolean }[];
  };
  userAnswer: number | string | null;
  isCorrect: boolean;
  responseTimeSec: number;
  difficulty: DifficultyLevel;
  skillTags: SkillTag[];
  answeredAt: number; // Unix epoch ms
  syncStatus: SyncStatus;
}

export interface SyncQueueItem {
  id: string; // e.g. "session_${sessionId}" or "answer_${answerId}"
  entityType: 'session' | 'answer';
  entityId: string;
  action: 'upsert';
  payload: TrainingSession | SessionAnswer;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  errorMessage: string | null;
}
