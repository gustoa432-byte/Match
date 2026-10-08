import { DifficultyLevel, Operator, OperationName } from './generator';
import { SkillTag } from './tagger';

export interface TaskMetric {
  id: string;
  operation: OperationName;
  operator: Operator;
  a: number;
  b: number;
  correctAnswer: number;
  userAnswer: number | string | null;
  correct: boolean;
  responseTime: number; // в секундах, напр. 1.82
  difficulty: DifficultyLevel;
  skillTags: SkillTag[];
  timestamp: number;
}

export interface WeakSpotItem {
  key: string; // "7×8"
  a: number;
  b: number;
  operator: Operator;
  errorCount: number;
  avgResponseTime: number;
  lastEncountered: number;
  isResolved: boolean;
}

export interface RepetitionItem {
  a: number;
  b: number;
  operator: Operator;
  level: DifficultyLevel;
  tags: SkillTag[];
  dueProblemNumber: number; // номер задачи в сессии, когда нужно повторить
}

export interface TrainingSessionRecord {
  id: string;
  timestamp: number;
  level: DifficultyLevel;
  mode: string;
  total: number;
  correct: number;
  accuracy: number; // 0-100
  avgTimeSec: number;
  bestStreak: number;
}

export interface SkillCategoryMastery {
  tagOrOp: string;
  displayName: string;
  masteryPercent: number; // 0-100
  accuracyPercent: number;
  avgSpeedSec: number;
  totalSampled: number;
}

export interface AppSettings {
  soundMuted: boolean;
  cleanMode: boolean;
  // Режим клавиатуры: true = использовать только экранный нампад (системная клавиатура смартфона НЕ открывается!)
  virtualKeypadOnly: boolean;
  speechAudioVoice: boolean;
}

export interface ExtendedStorageData {
  metricsHistory: TaskMetric[]; // последние 300 задач
  weakSpots: WeakSpotItem[];
  repetitionQueue: RepetitionItem[];
  trainingHistory: TrainingSessionRecord[];
  settings: AppSettings;
  suggestedFocus: {
    target: string;
    description: string;
    suggestedMix: { op: Operator; ratio: number }[];
  } | null;
}

const STORAGE_KEY = 'mental_math_v2_data';

const defaultSettings: AppSettings = {
  soundMuted: false,
  cleanMode: false,
  virtualKeypadOnly: true, // По умолчанию на телефонах системная клавиатура заблокирована
  speechAudioVoice: false,
};

const initialData: ExtendedStorageData = {
  metricsHistory: [],
  weakSpots: [],
  repetitionQueue: [],
  trainingHistory: [],
  settings: defaultSettings,
  suggestedFocus: null,
};

export function loadExtendedData(): ExtendedStorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...initialData };
    const parsed = JSON.parse(raw);
    return {
      ...initialData,
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
    };
  } catch {
    return { ...initialData };
  }
}

export function saveExtendedData(data: ExtendedStorageData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Игнорируем ошибку квоты
  }
}

/**
 * Расчёт карты навыков (Skill Map) на основе накопленных метрик
 */
export function calculateSkillMap(metrics: TaskMetric[]): {
  operations: SkillCategoryMastery[];
  patterns: SkillCategoryMastery[];
  overallFocus: string;
  focusExplanation: string;
} {
  const operationsDef: { key: OperationName; label: string }[] = [
    { key: 'addition', label: 'Сложение' },
    { key: 'subtraction', label: 'Вычитание' },
    { key: 'multiplication', label: 'Умножение' },
    { key: 'division', label: 'Деление' },
  ];

  const patternsDef: { key: SkillTag; label: string }[] = [
    { key: 'cross_ten', label: 'Переход через 10' },
    { key: 'cross_hundred', label: 'Переход через 100' },
    { key: 'times_table', label: 'Таблица умножения' },
    { key: 'fast_division', label: 'Быстрое деление' },
  ];

  function computeMastery(filtered: TaskMetric[], label: string, key: string): SkillCategoryMastery {
    if (filtered.length === 0) {
      return {
        tagOrOp: key,
        displayName: label,
        masteryPercent: 70, // начальный базовый уровень
        accuracyPercent: 0,
        avgSpeedSec: 0,
        totalSampled: 0,
      };
    }

    const correctCount = filtered.filter((m) => m.correct).length;
    const accuracy = (correctCount / filtered.length) * 100;
    const avgSpeed = filtered.reduce((acc, m) => acc + m.responseTime, 0) / filtered.length;

    // Скоростной балл: 1.0 сек -> 100%, 4.0 сек -> 40%, 6+ сек -> 10%
    let speedScore = 100 - (avgSpeed - 1.0) * 20;
    speedScore = Math.max(10, Math.min(100, speedScore));

    // Consistency (стабильность на последних 10)
    const recent = filtered.slice(-10);
    const recentAcc = (recent.filter((m) => m.correct).length / recent.length) * 100;

    // Формула Mastery: 40% точность + 30% скорость + 20% недавний результат + 10% сложность
    const mastery = Math.round(
      0.4 * accuracy + 0.3 * speedScore + 0.2 * recentAcc + 10
    );

    return {
      tagOrOp: key,
      displayName: label,
      masteryPercent: Math.max(5, Math.min(100, mastery)),
      accuracyPercent: Math.round(accuracy),
      avgSpeedSec: Number(avgSpeed.toFixed(2)),
      totalSampled: filtered.length,
    };
  }

  const operations = operationsDef.map((def) => {
    const list = metrics.filter((m) => m.operation === def.key);
    return computeMastery(list, def.label, def.key);
  });

  const patterns = patternsDef.map((def) => {
    const list = metrics.filter((m) => m.skillTags.includes(def.key));
    return computeMastery(list, def.label, def.key);
  });

  // Определение слабой зоны (ФОКУС)
  const sampledOps = operations.filter((o) => o.totalSampled >= 3);
  let overallFocus = 'Деление';
  let focusExplanation = 'Навык требует автоматизации и регулярной практики.';

  if (sampledOps.length > 0) {
    // Находим операцию с наименьшим mastery
    const weakest = [...sampledOps].sort((a, b) => a.masteryPercent - b.masteryPercent)[0];
    overallFocus = weakest.displayName;

    if (weakest.accuracyPercent < 80) {
      focusExplanation = `Точность составляет ${weakest.accuracyPercent}%. Рекомендуется уделить внимание безошибочному решению.`;
    } else if (weakest.avgSpeedSec > 3.0) {
      focusExplanation = `Точность высокая (${weakest.accuracyPercent}%), но среднее время (${weakest.avgSpeedSec}с) превышает норму автоматизма.`;
    } else {
      focusExplanation = `Текущий показатель уверенности: ${weakest.masteryPercent}%.`;
    }
  }

  return {
    operations,
    patterns,
    overallFocus,
    focusExplanation,
  };
}
