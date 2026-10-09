import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveEngine } from '../src/training/adaptiveEngine';
import { ExtendedStorageData, TaskMetric } from '../src/game/storage';

describe('AdaptiveEngine', () => {
  let engine: AdaptiveEngine;
  let mockStorage: ExtendedStorageData;

  beforeEach(() => {
    engine = new AdaptiveEngine();
    mockStorage = {
      metricsHistory: [],
      weakSpots: [],
      repetitionQueue: [],
      trainingHistory: [],
      settings: {
        soundMuted: false,
        cleanMode: false,
        virtualKeypadOnly: true,
        speechAudioVoice: false,
      },
      suggestedFocus: null,
    };
  });

  describe('Spaced Repetition Queue', () => {
    it('schedules repetitions at problemIndex + 3 and + 10 on wrong answer', () => {
      const metric: TaskMetric = {
        id: 'metric-1',
        operation: 'multiplication',
        operator: '×',
        a: 7,
        b: 8,
        correctAnswer: 56,
        userAnswer: 54,
        correct: false,
        responseTime: 2.5,
        difficulty: 1,
        skillTags: ['times_table'],
        timestamp: Date.now(),
      };

      engine.registerProblemResult(metric, 1, mockStorage);

      expect(mockStorage.repetitionQueue).toHaveLength(2);
      expect(mockStorage.repetitionQueue[0].dueProblemNumber).toBe(4); // 1 + 3
      expect(mockStorage.repetitionQueue[1].dueProblemNumber).toBe(11); // 1 + 10
      expect(mockStorage.repetitionQueue[0].a).toBe(7);
      expect(mockStorage.repetitionQueue[0].b).toBe(8);
      expect(mockStorage.repetitionQueue[0].operator).toBe('×');
    });

    it('does not schedule repetitions on correct answer', () => {
      const metric: TaskMetric = {
        id: 'metric-2',
        operation: 'addition',
        operator: '+',
        a: 5,
        b: 4,
        correctAnswer: 9,
        userAnswer: 9,
        correct: true,
        responseTime: 1.1,
        difficulty: 1,
        skillTags: ['single_digit'],
        timestamp: Date.now(),
      };

      engine.registerProblemResult(metric, 1, mockStorage);
      expect(mockStorage.repetitionQueue).toHaveLength(0);
    });

    it('retrieves due problem from repetitionQueue when problemIndex matches', () => {
      // Подготовим элемент очереди, который наступает на задаче 5
      mockStorage.repetitionQueue = [
        {
          a: 6,
          b: 7,
          operator: '×',
          level: 1,
          tags: ['times_table'],
          dueProblemNumber: 5,
        },
      ];

      // На задаче 4 элемент ещё не готов
      const probAt4 = engine.getNextProblem(1, 4, mockStorage, []);
      expect(mockStorage.repetitionQueue).toHaveLength(1);

      // На задаче 5 элемент должен быть извлечён
      const probAt5 = engine.getNextProblem(1, 5, mockStorage, []);
      expect(probAt5.a).toBe(6);
      expect(probAt5.b).toBe(7);
      expect(probAt5.operator).toBe('×');
      expect(mockStorage.repetitionQueue).toHaveLength(0); // извлечено из очереди
    });
  });

  describe('Weak Spots Management', () => {
    it('registers a weak spot when problem is answered incorrectly', () => {
      const metric: TaskMetric = {
        id: 'metric-3',
        operation: 'multiplication',
        operator: '×',
        a: 8,
        b: 9,
        correctAnswer: 72,
        userAnswer: 64,
        correct: false,
        responseTime: 2.0,
        difficulty: 1,
        skillTags: ['times_table'],
        timestamp: Date.now(),
      };

      engine.registerProblemResult(metric, 1, mockStorage);

      expect(mockStorage.weakSpots).toHaveLength(1);
      const ws = mockStorage.weakSpots[0];
      expect(ws.key).toBe('8×9');
      expect(ws.errorCount).toBe(1);
      expect(ws.isResolved).toBe(false);
    });

    it('registers a weak spot when response is slow (> 3.2s) even if answer is correct', () => {
      const metric: TaskMetric = {
        id: 'metric-4',
        operation: 'addition',
        operator: '+',
        a: 47,
        b: 38,
        correctAnswer: 85,
        userAnswer: 85,
        correct: true,
        responseTime: 3.8, // медленно
        difficulty: 2,
        skillTags: ['cross_ten'],
        timestamp: Date.now(),
      };

      engine.registerProblemResult(metric, 1, mockStorage);

      expect(mockStorage.weakSpots).toHaveLength(1);
      const ws = mockStorage.weakSpots[0];
      expect(ws.key).toBe('47+38');
      expect(ws.errorCount).toBe(0);
      expect(ws.avgResponseTime).toBe(3.8);
      expect(ws.isResolved).toBe(false);
    });

    it('resolves a weak spot when answered correctly and fast (< 2.0s)', () => {
      mockStorage.weakSpots = [
        {
          key: '7×8',
          a: 7,
          b: 8,
          operator: '×',
          errorCount: 2,
          avgResponseTime: 3.5,
          lastEncountered: Date.now() - 10000,
          isResolved: false,
        },
      ];

      const fastCorrectMetric: TaskMetric = {
        id: 'metric-5',
        operation: 'multiplication',
        operator: '×',
        a: 7,
        b: 8,
        correctAnswer: 56,
        userAnswer: 56,
        correct: true,
        responseTime: 1.4, // быстро и верно (< 2.0s)
        difficulty: 1,
        skillTags: ['times_table'],
        timestamp: Date.now(),
      };

      engine.registerProblemResult(fastCorrectMetric, 10, mockStorage);

      expect(mockStorage.weakSpots[0].isResolved).toBe(true);
    });

    it('does NOT resolve a weak spot when answered correctly but normal speed (>= 2.0s and <= 3.2s)', () => {
      mockStorage.weakSpots = [
        {
          key: '7×8',
          a: 7,
          b: 8,
          operator: '×',
          errorCount: 2,
          avgResponseTime: 3.5,
          lastEncountered: Date.now() - 10000,
          isResolved: false,
        },
      ];

      const normalCorrectMetric: TaskMetric = {
        id: 'metric-6',
        operation: 'multiplication',
        operator: '×',
        a: 7,
        b: 8,
        correctAnswer: 56,
        userAnswer: 56,
        correct: true,
        responseTime: 2.5, // верно, но не достаточно быстро для снятия статуса ошибки
        difficulty: 1,
        skillTags: ['times_table'],
        timestamp: Date.now(),
      };

      engine.registerProblemResult(normalCorrectMetric, 10, mockStorage);

      expect(mockStorage.weakSpots[0].isResolved).toBe(false);
    });

    it('caps weakSpots collection to 30 items max', () => {
      for (let i = 1; i <= 35; i++) {
        const metric: TaskMetric = {
          id: `metric-${i}`,
          operation: 'addition',
          operator: '+',
          a: i,
          b: 1,
          correctAnswer: i + 1,
          userAnswer: 0,
          correct: false,
          responseTime: 4.0,
          difficulty: 1,
          skillTags: [],
          timestamp: Date.now() + i,
        };
        engine.registerProblemResult(metric, i, mockStorage);
      }

      expect(mockStorage.weakSpots.length).toBeLessThanOrEqual(30);
    });
  });

  describe('Adaptive Problem Selection & Priorities', () => {
    it('picks from weak spots when weakSkillRatio triggers and matching weak spots exist', () => {
      const forcedEngine = new AdaptiveEngine({
        weakSkillRatio: 1.0,
        currentLevelRatio: 0,
        repetitionRatio: 0,
        randomRatio: 0,
      });

      mockStorage.weakSpots = [
        {
          key: '9×9',
          a: 9,
          b: 9,
          operator: '×',
          errorCount: 3,
          avgResponseTime: 4.0,
          lastEncountered: Date.now(),
          isResolved: false,
        },
      ];

      const nextProb = forcedEngine.getNextProblem(1, 1, mockStorage, [], ['×']);
      expect(nextProb.a).toBe(9);
      expect(nextProb.b).toBe(9);
      expect(nextProb.operator).toBe('×');
    });

    it('gives absolute priority to repetitionQueue over weakSpots when both are present', () => {
      const forcedEngine = new AdaptiveEngine({
        weakSkillRatio: 1.0,
        currentLevelRatio: 0,
        repetitionRatio: 0,
        randomRatio: 0,
      });

      // В очереди повторения стоит 3 × 3 (due at problem 5)
      mockStorage.repetitionQueue = [
        {
          a: 3,
          b: 3,
          operator: '×',
          level: 1,
          tags: ['times_table'],
          dueProblemNumber: 5,
        },
      ];

      // В слабых местах стоит 9 × 9
      mockStorage.weakSpots = [
        {
          key: '9×9',
          a: 9,
          b: 9,
          operator: '×',
          errorCount: 5,
          avgResponseTime: 5.0,
          lastEncountered: Date.now(),
          isResolved: false,
        },
      ];

      // На задаче 5 очередь повторений ДОЛЖНА сработать первой, минуя выбор из слабых мест
      const prob = forcedEngine.getNextProblem(1, 5, mockStorage, [], ['×']);
      expect(prob.a).toBe(3);
      expect(prob.b).toBe(3);
      expect(prob.operator).toBe('×');
      expect(mockStorage.repetitionQueue).toHaveLength(0); // извлечено из очереди
    });

    it('handles empty or missing storage collections safely without crashing', () => {
      const emptyStorage = {} as ExtendedStorageData;
      expect(() => {
        const prob = engine.getNextProblem(1, 1, emptyStorage, []);
        expect(prob).toBeDefined();
        expect(prob.answer).toBeDefined();
      }).not.toThrow();

      expect(() => {
        const dummyMetric: TaskMetric = {
          id: 'test',
          operation: 'addition',
          operator: '+',
          a: 2,
          b: 2,
          correctAnswer: 4,
          userAnswer: 4,
          correct: true,
          responseTime: 1.0,
          difficulty: 1,
          skillTags: [],
          timestamp: Date.now(),
        };
        engine.registerProblemResult(dummyMetric, 1, emptyStorage);
      }).not.toThrow();
    });
  });
});
