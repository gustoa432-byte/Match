import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateSkillMap,
  loadExtendedData,
  saveExtendedData,
  TaskMetric,
  ExtendedStorageData,
} from '../src/game/storage';

describe('Storage and Skill Map calculation', () => {
  describe('calculateSkillMap', () => {
    it('returns default baseline mastery when metrics are empty', () => {
      const result = calculateSkillMap([]);

      expect(result.operations).toHaveLength(4);
      expect(result.patterns).toHaveLength(4);

      for (const op of result.operations) {
        expect(op.masteryPercent).toBe(70);
        expect(op.totalSampled).toBe(0);
      }
      expect(result.overallFocus).toBeDefined();
      expect(result.focusExplanation).toBeDefined();
    });

    it('computes accurate mastery and detects weakest operation as focus', () => {
      const sampleMetrics: TaskMetric[] = [
        // 5 быстрых верных задач на сложение (время 1.1s, 100% верных)
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `add-${i}`,
          operation: 'addition' as const,
          operator: '+' as const,
          a: 5,
          b: 5,
          correctAnswer: 10,
          userAnswer: 10,
          correct: true,
          responseTime: 1.1,
          difficulty: 1 as const,
          skillTags: ['single_digit' as const],
          timestamp: Date.now(),
        })),
        // 5 медленных неверных задач на деление (время 4.5s, 0% верных)
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `div-${i}`,
          operation: 'division' as const,
          operator: '÷' as const,
          a: 24,
          b: 6,
          correctAnswer: 4,
          userAnswer: 5,
          correct: false,
          responseTime: 4.5,
          difficulty: 1 as const,
          skillTags: ['times_table' as const],
          timestamp: Date.now(),
        })),
      ];

      const result = calculateSkillMap(sampleMetrics);

      const addStats = result.operations.find((o) => o.tagOrOp === 'addition');
      const divStats = result.operations.find((o) => o.tagOrOp === 'division');

      expect(addStats).toBeDefined();
      expect(divStats).toBeDefined();

      expect(addStats!.accuracyPercent).toBe(100);
      expect(divStats!.accuracyPercent).toBe(0);

      expect(addStats!.masteryPercent).toBeGreaterThan(divStats!.masteryPercent);
      // Деление должно стать текущим фокусом, так как это самая слабая операция с выборкой >= 3
      expect(result.overallFocus).toBe('Деление');
      expect(result.focusExplanation).toContain('Точность');
    });

    it('verifies exact mastery formula math and bounding clamps', () => {
      // 10 задач с известными фиксированными значениями:
      // accuracy = 100%, avgSpeed = 1.0s (speedScore = 100), recentAcc = 100%
      // 0.4*100 + 0.3*100 + 0.2*100 + 10 = 40 + 30 + 20 + 10 = 100
      const perfectMetrics: TaskMetric[] = Array.from({ length: 10 }, (_, i) => ({
        id: `m-${i}`,
        operation: 'multiplication' as const,
        operator: '×' as const,
        a: 3,
        b: 3,
        correctAnswer: 9,
        userAnswer: 9,
        correct: true,
        responseTime: 1.0,
        difficulty: 1 as const,
        skillTags: ['times_table' as const],
        timestamp: Date.now(),
      }));

      const res = calculateSkillMap(perfectMetrics);
      const mult = res.operations.find((o) => o.tagOrOp === 'multiplication');
      expect(mult?.masteryPercent).toBe(100);

      // Экстремально медленные ошибочные задачи (> 6 сек)
      // accuracy = 0%, avgSpeed = 8.0s -> speedScore clamped to 10%, recentAcc = 0%
      // 0.4*0 + 0.3*10 + 0.2*0 + 10 = 13%
      const slowBadMetrics: TaskMetric[] = Array.from({ length: 10 }, (_, i) => ({
        id: `slow-${i}`,
        operation: 'subtraction' as const,
        operator: '−' as const,
        a: 10,
        b: 5,
        correctAnswer: 5,
        userAnswer: 0,
        correct: false,
        responseTime: 8.0,
        difficulty: 1 as const,
        skillTags: [],
        timestamp: Date.now(),
      }));

      const resSlow = calculateSkillMap(slowBadMetrics);
      const sub = resSlow.operations.find((o) => o.tagOrOp === 'subtraction');
      expect(sub?.masteryPercent).toBe(13);
      expect(sub?.accuracyPercent).toBe(0);
      expect(sub?.avgSpeedSec).toBe(8.0);
    });

    it('computes pattern mastery for skill tags', () => {
      const sampleMetrics: TaskMetric[] = [
        {
          id: 'cross-1',
          operation: 'addition',
          operator: '+',
          a: 17,
          b: 8,
          correctAnswer: 25,
          userAnswer: 25,
          correct: true,
          responseTime: 1.5,
          difficulty: 2,
          skillTags: ['two_digit', 'cross_ten'],
          timestamp: Date.now(),
        },
      ];

      const result = calculateSkillMap(sampleMetrics);
      const crossTenPattern = result.patterns.find((p) => p.tagOrOp === 'cross_ten');

      expect(crossTenPattern).toBeDefined();
      expect(crossTenPattern!.totalSampled).toBe(1);
      expect(crossTenPattern!.accuracyPercent).toBe(100);
    });
  });

  describe('loadExtendedData & saveExtendedData', () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      });
    });

    it('loads initial defaults when localStorage is empty', () => {
      const data = loadExtendedData();
      expect(data.metricsHistory).toEqual([]);
      expect(data.weakSpots).toEqual([]);
      expect(data.repetitionQueue).toEqual([]);
      expect(data.settings.soundMuted).toBe(false);
      expect(data.settings.virtualKeypadOnly).toBe(true);
    });

    it('gracefully handles invalid JSON in localStorage', () => {
      mockStorage['mental_math_v2_data'] = 'INVALID_JSON_CORRUPTED';
      const data = loadExtendedData();
      expect(data.metricsHistory).toEqual([]);
      expect(data.settings).toBeDefined();
    });

    it('safely merges partial storage data and retains default settings for missing keys', () => {
      // Хранилище содержит только часть полей, без настроек звука или клавиатуры
      mockStorage['mental_math_v2_data'] = JSON.stringify({
        metricsHistory: [],
        settings: {
          soundMuted: true,
        },
      });

      const data = loadExtendedData();
      expect(data.settings.soundMuted).toBe(true);
      expect(data.settings.virtualKeypadOnly).toBe(true); // сохранено значение по умолчанию
      expect(data.settings.cleanMode).toBe(false);
      expect(data.weakSpots).toEqual([]);
    });

    it('saves and reloads data correctly', () => {
      const initial = loadExtendedData();
      const updated: ExtendedStorageData = {
        ...initial,
        weakSpots: [
          {
            key: '6×7',
            a: 6,
            b: 7,
            operator: '×',
            errorCount: 1,
            avgResponseTime: 2.5,
            lastEncountered: 1234567,
            isResolved: false,
          },
        ],
      };

      saveExtendedData(updated);
      const reloaded = loadExtendedData();

      expect(reloaded.weakSpots).toHaveLength(1);
      expect(reloaded.weakSpots[0].key).toBe('6×7');
    });
  });
});
