import {
  DifficultyLevel,
  Operator,
  Problem,
  generateProblem,
} from '../game/generator';
import {
  TaskMetric,
  WeakSpotItem,
  RepetitionItem,
  ExtendedStorageData,
} from '../game/storage';
import { randomInt } from '../utils/random';

export interface AdaptiveConfig {
  weakSkillRatio: number; // 0.30
  currentLevelRatio: number; // 0.30
  repetitionRatio: number; // 0.20
  randomRatio: number; // 0.20
}

export const defaultAdaptiveConfig: AdaptiveConfig = {
  weakSkillRatio: 0.3,
  currentLevelRatio: 0.3,
  repetitionRatio: 0.2,
  randomRatio: 0.2,
};

/**
 * Адаптивный движок генерации задач
 */
export class AdaptiveEngine {
  private config: AdaptiveConfig;

  constructor(config: AdaptiveConfig = defaultAdaptiveConfig) {
    this.config = config;
  }

  /**
   * Выбор следующей задачи на основе адаптивного профиля
   */
  public getNextProblem(
    level: DifficultyLevel,
    currentProblemIndex: number,
    storage: ExtendedStorageData,
    recentProblems: Problem[],
    allowedOperators: Operator[] = ['+', '−', '×', '÷']
  ): Problem {
    // 1. Проверяем очередь интервального повторения ошибок (Spaced Repetition)
    const repetitionQueue = storage.repetitionQueue || [];
    const dueRepetition = repetitionQueue.find(
      (item) => item.dueProblemNumber <= currentProblemIndex
    );

    if (dueRepetition) {
      // Удаляем из очереди обработанную задачу
      storage.repetitionQueue = repetitionQueue.filter((item) => item !== dueRepetition);

      return generateProblem({
        level: dueRepetition.level,
        forceSpecificPair: {
          a: dueRepetition.a,
          b: dueRepetition.b,
          operator: dueRepetition.operator,
        },
        recentProblems,
      });
    }

    // 2. Бросаем случайный процент (0–99) для адаптивной маршрутизации
    const roll = randomInt(0, 99);

    // 30% — Weak Spots (Слабые навыки и комбинации с медленным временем или частыми ошибками)
    if (roll < this.config.weakSkillRatio * 100) {
      const activeWeakSpots = (storage.weakSpots || []).filter(
        (ws) => !ws.isResolved && allowedOperators.includes(ws.operator)
      );

      if (activeWeakSpots.length > 0) {
        // Выбираем один из слабых спотов
        const chosen = activeWeakSpots[randomInt(0, activeWeakSpots.length - 1)];
        return generateProblem({
          level,
          forceSpecificPair: {
            a: chosen.a,
            b: chosen.b,
            operator: chosen.operator,
          },
          recentProblems,
        });
      }
    }

    // Обычная генерация с защитой от анти-рандома
    return generateProblem({
      level,
      allowedOperators,
      recentProblems,
    });
  }

  /**
   * Обновление слабых мест (Weak Spots) и добавление ошибки в интервальное повторение
   */
  public registerProblemResult(
    metric: TaskMetric,
    currentProblemNumber: number,
    storage: ExtendedStorageData
  ): void {
    // 1. Если ответ неверный — добавляем в очередь интервального повторения
    if (!metric.correct) {
      const queue = storage.repetitionQueue || [];
      // Повтор 1: через 3 задачи
      queue.push({
        a: metric.a,
        b: metric.b,
        operator: metric.operator,
        level: metric.difficulty,
        tags: metric.skillTags,
        dueProblemNumber: currentProblemNumber + 3,
      });

      // Повтор 2: через 10 задач
      queue.push({
        a: metric.a,
        b: metric.b,
        operator: metric.operator,
        level: metric.difficulty,
        tags: metric.skillTags,
        dueProblemNumber: currentProblemNumber + 10,
      });

      storage.repetitionQueue = queue;
    }

    // 2. Обновление Weak Spot базы
    const key = `${metric.a}${metric.operator}${metric.b}`;
    let weakSpots = storage.weakSpots || [];
    const existingIndex = weakSpots.findIndex((ws) => ws.key === key);

    const isSlow = metric.responseTime > 3.2; // медленнее нормы
    const isBad = !metric.correct;

    if (isBad || isSlow) {
      if (existingIndex >= 0) {
        const item = weakSpots[existingIndex];
        item.errorCount += isBad ? 1 : 0;
        item.avgResponseTime = Number(
          ((item.avgResponseTime + metric.responseTime) / 2).toFixed(2)
        );
        item.lastEncountered = Date.now();
        item.isResolved = false;
      } else {
        weakSpots.push({
          key,
          a: metric.a,
          b: metric.b,
          operator: metric.operator,
          errorCount: isBad ? 1 : 0,
          avgResponseTime: metric.responseTime,
          lastEncountered: Date.now(),
          isResolved: false,
        });
      }
    } else if (metric.correct && metric.responseTime < 2.0 && existingIndex >= 0) {
      // Пользователь быстро и верно решил задачу из списка слабых мест
      weakSpots[existingIndex].isResolved = true;
    }

    // Оставляем топ-30 неразрешённых слабых мест
    storage.weakSpots = weakSpots.slice(-30);
  }
}

export const adaptiveEngine = new AdaptiveEngine();
