import { describe, it, expect } from 'vitest';
import {
  generateAddition,
  generateSubtraction,
  generateMultiplication,
  generateDivision,
  generateProblem,
  createEstimationRanges,
  generateLadderSequence,
  DifficultyLevel,
  Operator,
  Problem,
} from '../src/game/generator';

describe('Math Problem Generator', () => {
  describe('generateAddition', () => {
    it.each([1, 2, 3] as DifficultyLevel[])('Level %i produces valid addition and correct answer', (lvl) => {
      for (let i = 0; i < 100; i++) {
        const p = generateAddition(lvl);
        expect(p.operator).toBe('+');
        expect(p.operation).toBe('addition');
        expect(p.answer).toBe(p.a + p.b);
        expect(p.a).toBeGreaterThanOrEqual(1);
        expect(p.b).toBeGreaterThanOrEqual(1);

        if (lvl === 1) {
          expect(p.a).toBeLessThanOrEqual(9);
          expect(p.b).toBeLessThanOrEqual(9);
        } else if (lvl === 2) {
          expect(p.a).toBeLessThanOrEqual(99);
          expect(p.b).toBeLessThanOrEqual(99);
        } else {
          expect(p.a).toBeLessThanOrEqual(999);
          expect(p.b).toBeLessThanOrEqual(999);
        }
      }
    });

    it('handles forceTag cross_ten for addition', () => {
      for (let i = 0; i < 50; i++) {
        const p = generateAddition(1, 'cross_ten');
        expect(p.a + p.b).toBeGreaterThanOrEqual(10);
        expect(p.tags).toContain('cross_ten');
      }
    });
  });

  describe('generateSubtraction', () => {
    it.each([1, 2, 3] as DifficultyLevel[])('Level %i produces non-negative result (a >= b)', (lvl) => {
      for (let i = 0; i < 100; i++) {
        const p = generateSubtraction(lvl);
        expect(p.operator).toBe('−');
        expect(p.operation).toBe('subtraction');
        expect(p.answer).toBe(p.a - p.b);
        expect(p.a).toBeGreaterThanOrEqual(p.b);
        expect(p.answer).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('generateMultiplication', () => {
    it.each([1, 2, 3] as DifficultyLevel[])('Level %i produces accurate product with correct operand ranges', (lvl) => {
      for (let i = 0; i < 100; i++) {
        const p = generateMultiplication(lvl);
        expect(p.operator).toBe('×');
        expect(p.operation).toBe('multiplication');
        expect(p.answer).toBe(p.a * p.b);
        expect(p.a).toBeGreaterThanOrEqual(1);
        expect(p.b).toBeGreaterThanOrEqual(1);

        if (lvl === 1) {
          expect(p.a).toBeLessThanOrEqual(9);
          expect(p.b).toBeLessThanOrEqual(9);
          expect(p.tags).toContain('times_table');
        } else if (lvl === 2) {
          // Двузначное (10..99) × однозначное (2..9) в произвольном порядке операндов
          const minOp = Math.min(p.a, p.b);
          const maxOp = Math.max(p.a, p.b);
          expect(minOp).toBeGreaterThanOrEqual(2);
          expect(minOp).toBeLessThanOrEqual(9);
          expect(maxOp).toBeGreaterThanOrEqual(10);
          expect(maxOp).toBeLessThanOrEqual(99);
        } else if (lvl === 3) {
          // Трёхзначное (100..999) × однозначное (2..9) в произвольном порядке операндов
          const minOp = Math.min(p.a, p.b);
          const maxOp = Math.max(p.a, p.b);
          expect(minOp).toBeGreaterThanOrEqual(2);
          expect(minOp).toBeLessThanOrEqual(9);
          expect(maxOp).toBeGreaterThanOrEqual(100);
          expect(maxOp).toBeLessThanOrEqual(999);
        }
      }
    });
  });

  describe('generateDivision', () => {
    it.each([1, 2, 3] as DifficultyLevel[])('Level %i produces integer result with divisor > 0 and no remainder', (lvl) => {
      for (let i = 0; i < 100; i++) {
        const p = generateDivision(lvl);
        expect(p.operator).toBe('÷');
        expect(p.operation).toBe('division');
        expect(p.b).toBeGreaterThan(0);
        expect(p.a % p.b).toBe(0); // Нацело без остатка
        expect(p.answer).toBe(p.a / p.b);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(p.answer).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('generateProblem and Anti-Random rules', () => {
    it('restricts generated problems to allowedOperators', () => {
      const allowedOps: Operator[] = ['+', '×'];
      for (let i = 0; i < 50; i++) {
        const p = generateProblem({ level: 1, allowedOperators: allowedOps });
        expect(allowedOps).toContain(p.operator);
      }
    });

    it('forces a different operator when last 3 problems had the same operator', () => {
      const recent: Problem[] = [
        { id: '1', a: 2, b: 3, operator: '+', operation: 'addition', answer: 5, level: 1, tags: [] },
        { id: '2', a: 3, b: 4, operator: '+', operation: 'addition', answer: 7, level: 1, tags: [] },
        { id: '3', a: 4, b: 5, operator: '+', operation: 'addition', answer: 9, level: 1, tags: [] },
      ];

      let nonAdditionCount = 0;
      const iterations = 50;
      for (let i = 0; i < iterations; i++) {
        const p = generateProblem({
          level: 1,
          allowedOperators: ['+', '−', '×'],
          recentProblems: recent,
        });
        if (p.operator !== '+') {
          nonAdditionCount++;
        }
      }
      // Anti-random rule must completely prevent a 4th consecutive '+' when alternatives exist
      expect(nonAdditionCount).toBe(iterations);
    });

    it('avoids exact duplicate of the immediate last 2 problems', () => {
      const recent: Problem[] = [
        { id: '1', a: 5, b: 5, operator: '+', operation: 'addition', answer: 10, level: 1, tags: [] },
        { id: '2', a: 7, b: 8, operator: '+', operation: 'addition', answer: 15, level: 1, tags: [] },
      ];

      for (let i = 0; i < 50; i++) {
        const p = generateProblem({
          level: 1,
          allowedOperators: ['+'],
          recentProblems: recent,
        });
        const isExactDup = (p.a === 7 && p.b === 8) || (p.a === 5 && p.b === 5);
        expect(isExactDup).toBe(false);
      }
    });

    it('decorates alternative problem types properly', () => {
      // True/False
      const tf = generateProblem({ level: 1, problemType: 'true_false' });
      expect(tf.type).toBe('true_false');
      expect(typeof tf.proposedAnswer).toBe('number');

      // Missing operator
      const mo = generateProblem({ level: 1, problemType: 'missing_operator' });
      expect(mo.type).toBe('missing_operator');

      // Missing number
      const mn = generateProblem({ level: 1, problemType: 'missing_number' });
      expect(mn.type).toBe('missing_number');
      expect(['a', 'b']).toContain(mn.missingSlot);

      // Estimation
      const est = generateProblem({ level: 1, problemType: 'estimation' });
      expect(est.type).toBe('estimation');
      expect(est.estimationRanges).toBeDefined();
      expect(est.estimationRanges?.length).toBe(4);
    });
  });

  describe('createEstimationRanges', () => {
    it.each([15, 85, 450, 1200, 7500])('creates 4 ranges where exactly one is correct for value %i', (val) => {
      const ranges = createEstimationRanges(val);
      expect(ranges).toHaveLength(4);
      const correctRanges = ranges.filter((r) => r.isCorrect);
      expect(correctRanges).toHaveLength(1);
    });
  });

  describe('generateLadderSequence', () => {
    it('generates sequence of 5 problems with increasing magnitudes', () => {
      const ladder = generateLadderSequence('+', 5);
      expect(ladder).toHaveLength(5);
      for (let i = 0; i < ladder.length - 1; i++) {
        expect(ladder[i + 1].a).toBeGreaterThanOrEqual(ladder[i].a);
      }
    });
  });
});
