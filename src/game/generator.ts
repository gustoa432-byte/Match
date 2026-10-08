import { randomInt, randomChoice } from '../utils/random';
import { SkillTag, analyzeSkillTags } from './tagger';

export type Operator = '+' | '−' | '×' | '÷';
export type OperationName = 'addition' | 'subtraction' | 'multiplication' | 'division';
export type DifficultyLevel = 1 | 2 | 3;

export interface Problem {
  id: string;
  a: number;
  operator: Operator;
  operation: OperationName;
  b: number;
  answer: number;
  level: DifficultyLevel;
  tags: SkillTag[];
  // Дополнительные свойства для альтернативных режимов
  type?: 'standard' | 'true_false' | 'missing_operator' | 'missing_number' | 'estimation';
  proposedAnswer?: number; // для режима True/False
  missingSlot?: 'a' | 'b'; // для режима Missing Number (например, ? + b = ans или a + ? = ans)
  estimationRanges?: { label: string; min: number; max: number; isCorrect: boolean }[]; // для Estimation
}

export function opToName(op: Operator): OperationName {
  switch (op) {
    case '+': return 'addition';
    case '−': return 'subtraction';
    case '×': return 'multiplication';
    case '÷': return 'division';
  }
}

export function nameToOp(name: OperationName): Operator {
  switch (name) {
    case 'addition': return '+';
    case 'subtraction': return '−';
    case 'multiplication': return '×';
    case 'division': return '÷';
  }
}

/**
 * Генерация сложения (+)
 */
export function generateAddition(
  level: DifficultyLevel,
  forceTag?: SkillTag
): Omit<Problem, 'id'> {
  let a: number;
  let b: number;

  switch (level) {
    case 1:
      if (forceTag === 'cross_ten') {
        a = randomInt(4, 9);
        b = randomInt(10 - (a % 10), 9);
      } else {
        a = randomInt(1, 9);
        b = randomInt(1, 9);
      }
      break;

    case 2:
      if (forceTag === 'cross_ten') {
        // Гарантируем переход через десяток
        a = randomInt(10, 89);
        const aUnits = a % 10;
        const minBUnits = Math.max(1, 10 - aUnits);
        const bUnits = randomInt(minBUnits, 9);
        const bTens = randomInt(1, 8);
        b = bTens * 10 + bUnits;
      } else {
        a = randomInt(10, 99);
        b = randomInt(10, 99);
      }
      break;

    case 3:
      if (forceTag === 'cross_hundred') {
        a = randomInt(100, 899);
        b = randomInt(1000 - a, 999);
      } else {
        a = randomInt(100, 999);
        b = randomInt(100, 999);
      }
      break;
  }

  const answer = a + b;
  const tags = analyzeSkillTags('addition', a, b, answer);

  return {
    a,
    operator: '+',
    operation: 'addition',
    b,
    answer,
    level,
    tags,
    type: 'standard',
  };
}

/**
 * Генерация вычитания (−) с гарантией a >= b
 */
export function generateSubtraction(
  level: DifficultyLevel,
  forceTag?: SkillTag
): Omit<Problem, 'id'> {
  let a: number;
  let b: number;

  switch (level) {
    case 1: {
      const n1 = randomInt(1, 9);
      const n2 = randomInt(1, 9);
      a = Math.max(n1, n2);
      b = Math.min(n1, n2);
      break;
    }

    case 2: {
      if (forceTag === 'cross_ten') {
        // Гарантируем заём единиц: aUnits < bUnits
        const aTens = randomInt(2, 9);
        const aUnits = randomInt(0, 7);
        a = aTens * 10 + aUnits;

        const bTens = randomInt(1, aTens - 1);
        const bUnits = randomInt(aUnits + 1, 9);
        b = bTens * 10 + bUnits;
      } else {
        const n1 = randomInt(10, 99);
        const n2 = randomInt(10, 99);
        a = Math.max(n1, n2);
        b = Math.min(n1, n2);
      }
      break;
    }

    case 3: {
      const n1 = randomInt(100, 999);
      const n2 = randomInt(100, 999);
      a = Math.max(n1, n2);
      b = Math.min(n1, n2);
      break;
    }
  }

  const answer = a - b;
  const tags = analyzeSkillTags('subtraction', a, b, answer);

  return {
    a,
    operator: '−',
    operation: 'subtraction',
    b,
    answer,
    level,
    tags,
    type: 'standard',
  };
}

/**
 * Генерация умножения (×)
 */
export function generateMultiplication(
  level: DifficultyLevel,
  forceTag?: SkillTag
): Omit<Problem, 'id'> {
  let a: number;
  let b: number;

  switch (level) {
    case 1:
      // Таблица умножения
      a = randomInt(1, 9);
      b = randomInt(1, 9);
      break;

    case 2: {
      // Двузначное × однозначное
      const big = randomInt(10, 99);
      const small = randomInt(2, 9);
      if (randomInt(0, 1) === 1) {
        a = big;
        b = small;
      } else {
        a = small;
        b = big;
      }
      break;
    }

    case 3: {
      // Трёхзначное × однозначное
      const big = randomInt(100, 999);
      const small = randomInt(2, 9);
      if (randomInt(0, 1) === 1) {
        a = big;
        b = small;
      } else {
        a = small;
        b = big;
      }
      break;
    }
  }

  const answer = a * b;
  const tags = analyzeSkillTags('multiplication', a, b, answer);

  return {
    a,
    operator: '×',
    operation: 'multiplication',
    b,
    answer,
    level,
    tags,
    type: 'standard',
  };
}

/**
 * Генерация деления (÷) с гарантией целого результата
 */
export function generateDivision(
  level: DifficultyLevel,
  forceTag?: SkillTag
): Omit<Problem, 'id'> {
  let a: number;
  let b: number;
  let answer: number;

  switch (level) {
    case 1: {
      b = randomInt(2, 9);
      answer = randomInt(1, 9);
      a = b * answer;
      break;
    }

    case 2: {
      b = randomInt(2, 9);
      const minAns = Math.max(1, Math.ceil(10 / b));
      const maxAns = Math.floor(99 / b);
      answer = randomInt(minAns, maxAns);
      a = b * answer;
      break;
    }

    case 3: {
      b = randomInt(2, 12);
      const minAns = Math.ceil(100 / b);
      const maxAns = Math.floor(999 / b);
      answer = randomInt(minAns, maxAns);
      a = b * answer;
      break;
    }
  }

  const tags = analyzeSkillTags('division', a, b, answer);

  return {
    a,
    operator: '÷',
    operation: 'division',
    b,
    answer,
    level,
    tags,
    type: 'standard',
  };
}

export interface GeneratorContext {
  level: DifficultyLevel;
  allowedOperators?: readonly Operator[];
  forceTag?: SkillTag;
  forceSpecificPair?: { a: number; b: number; operator: Operator };
  recentProblems?: Problem[];
  problemType?: 'standard' | 'true_false' | 'missing_operator' | 'missing_number' | 'estimation';
}

/**
 * Основная функция генерации задачи с защитой от анти-рандома
 */
export function generateProblem(context: GeneratorContext | DifficultyLevel): Problem {
  const ctx: GeneratorContext =
    typeof context === 'number'
      ? { level: context, allowedOperators: ['+', '−', '×', '÷'] }
      : context;

  const level = ctx.level;
  const allowedOps = ctx.allowedOperators && ctx.allowedOperators.length > 0
    ? ctx.allowedOperators
    : (['+', '−', '×', '÷'] as const);

  // Если задана конкретная слабая пара из Weak Spots
  if (ctx.forceSpecificPair) {
    const { a, b, operator } = ctx.forceSpecificPair;
    let answer: number;
    switch (operator) {
      case '+': answer = a + b; break;
      case '−': answer = a - b; break;
      case '×': answer = a * b; break;
      case '÷': answer = Math.round(a / b); break;
    }
    const operation = opToName(operator);
    const tags = analyzeSkillTags(operation, a, b, answer);
    const problem: Problem = {
      id: `${Date.now()}-${randomInt(1000, 9999)}`,
      a,
      operator,
      operation,
      b,
      answer,
      level,
      tags,
      type: ctx.problemType || 'standard',
    };
    return decorateProblemType(problem, ctx.problemType);
  }

  // Защита от анти-рандома (избегаем одной и той же операции подряд 4+ раз)
  let chosenOp: Operator;
  const recent = ctx.recentProblems || [];
  if (recent.length >= 3 && allowedOps.length > 1) {
    const lastThreeOps = recent.slice(-3).map((p) => p.operator);
    if (lastThreeOps[0] === lastThreeOps[1] && lastThreeOps[1] === lastThreeOps[2]) {
      // Исключаем застрявший оператор
      const remainingOps = allowedOps.filter((op) => op !== lastThreeOps[0]);
      chosenOp = remainingOps.length > 0 ? randomChoice(remainingOps) : randomChoice(allowedOps);
    } else {
      chosenOp = randomChoice(allowedOps);
    }
  } else {
    chosenOp = randomChoice(allowedOps);
  }

  if (ctx.problemType === 'estimation') {
    const est = generateEstimationProblem(level);
    return {
      ...est,
      id: `${Date.now()}-${randomInt(1000, 9999)}`,
    };
  }

  // Генерация задачи с защитой от повторения точно такой же задачи
  let raw: Omit<Problem, 'id'> | null = null;
  let attempts = 0;

  while (attempts < 6) {
    attempts++;
    switch (chosenOp) {
      case '+':
        raw = generateAddition(level, ctx.forceTag);
        break;
      case '−':
        raw = generateSubtraction(level, ctx.forceTag);
        break;
      case '×':
        raw = generateMultiplication(level, ctx.forceTag);
        break;
      case '÷':
        raw = generateDivision(level, ctx.forceTag);
        break;
    }

    // Проверяем, не была ли эта задача только что в последних 2
    const isDuplicate = recent.slice(-2).some(
      (p) => p.a === raw!.a && p.b === raw!.b && p.operator === raw!.operator
    );
    if (!isDuplicate) break;
  }

  const problem: Problem = {
    ...raw!,
    id: `${Date.now()}-${randomInt(1000, 9999)}`,
    type: ctx.problemType || 'standard',
  };

  return decorateProblemType(problem, ctx.problemType);
}

/**
 * Создание математически выверенных интервалов для режима Оценка
 */
export function createEstimationRanges(exact: number): {
  label: string;
  min: number;
  max: number;
  isCorrect: boolean;
}[] {
  const E = Math.max(1, exact);

  // Подбираем удобный шаг деления
  let step: number;
  if (E < 80) step = 15;
  else if (E < 200) step = 40;
  else if (E < 600) step = 100;
  else if (E < 1500) step = 250;
  else if (E < 5000) step = 800;
  else if (E < 15000) step = 2500;
  else if (E < 50000) step = 8000;
  else step = 20000;

  const rounded = Math.round(E / step) * step;
  let b2 = Math.max(step * 2, rounded);
  let b1 = Math.max(step, b2 - step);
  let b3 = b2 + step;

  if (b1 >= b2) {
    b1 = Math.round(b2 / 2);
  }
  if (b3 <= b2) {
    b3 = b2 + step;
  }

  const isRange1 = E < b1;
  const isRange2 = E >= b1 && E <= b2;
  const isRange3 = E > b2 && E <= b3;
  const isRange4 = E > b3;

  return [
    {
      label: `< ${b1.toLocaleString('ru-RU')}`,
      min: 0,
      max: b1,
      isCorrect: isRange1,
    },
    {
      label: `${b1.toLocaleString('ru-RU')} – ${b2.toLocaleString('ru-RU')}`,
      min: b1,
      max: b2,
      isCorrect: isRange2,
    },
    {
      label: `${b2.toLocaleString('ru-RU')} – ${b3.toLocaleString('ru-RU')}`,
      min: b2,
      max: b3,
      isCorrect: isRange3,
    },
    {
      label: `> ${b3.toLocaleString('ru-RU')}`,
      min: b3,
      max: Infinity,
      isCorrect: isRange4,
    },
  ];
}

/**
 * Специализированный генератор задач для режима Оценка (Estimation)
 * Создаёт выражения, требующие именно быстрого округления в уме
 */
export function generateEstimationProblem(level: DifficultyLevel): Omit<Problem, 'id'> {
  let a: number;
  let b: number;
  let op: Operator;

  switch (level) {
    case 1: {
      const opChoice = randomChoice(['+', '−', '×'] as const);
      op = opChoice;
      if (op === '+') {
        a = randomInt(25, 95);
        b = randomInt(25, 95);
      } else if (op === '−') {
        a = randomInt(50, 99);
        b = randomInt(15, a - 10);
      } else {
        a = randomInt(15, 69);
        b = randomInt(4, 9);
      }
      break;
    }
    case 2: {
      const opChoice = randomChoice(['×', '+', '−', '÷'] as const);
      op = opChoice;
      if (op === '×') {
        a = randomInt(21, 89);
        b = randomInt(15, 65);
      } else if (op === '+') {
        a = randomInt(250, 890);
        b = randomInt(250, 890);
      } else if (op === '−') {
        a = randomInt(500, 990);
        b = randomInt(150, a - 50);
      } else {
        const quotient = randomInt(15, 45);
        b = randomInt(12, 35);
        a = b * quotient;
      }
      break;
    }
    case 3: {
      const opChoice = randomChoice(['×', '×', '+', '÷'] as const);
      op = opChoice;
      if (op === '×') {
        // Как в ТЗ: 398 × 21 ≈ 8000
        a = randomInt(195, 795);
        b = randomInt(18, 65);
      } else if (op === '+') {
        a = randomInt(1200, 8500);
        b = randomInt(1200, 8500);
      } else {
        const quotient = randomInt(45, 150);
        b = randomInt(25, 75);
        a = b * quotient;
      }
      break;
    }
  }

  let answer: number;
  switch (op) {
    case '+': answer = a + b; break;
    case '−': answer = a - b; break;
    case '×': answer = a * b; break;
    case '÷': answer = Math.round(a / b); break;
  }

  const ranges = createEstimationRanges(answer);
  const operation = opToName(op);

  return {
    a,
    operator: op,
    operation,
    b,
    answer,
    level,
    tags: ['multi_step'],
    type: 'estimation',
    estimationRanges: ranges,
  };
}

/**
 * Обогащение задачи для спец-режимов (True/False, Missing Number, Missing Operator)
 */
function decorateProblemType(
  problem: Problem,
  type?: 'standard' | 'true_false' | 'missing_operator' | 'missing_number' | 'estimation'
): Problem {
  if (!type || type === 'standard') return problem;

  problem.type = type;

  if (type === 'true_false') {
    const isActuallyCorrect = randomInt(0, 1) === 1;
    if (isActuallyCorrect) {
      problem.proposedAnswer = problem.answer;
    } else {
      const deltas = [-2, -1, 1, 2, 10, -10];
      const delta = randomChoice(deltas);
      let proposed = problem.answer + delta;
      if (proposed <= 0 && problem.answer > 0) proposed = problem.answer + 2;
      problem.proposedAnswer = proposed;
    }
  } else if (type === 'missing_number') {
    problem.missingSlot = randomInt(0, 1) === 0 ? 'a' : 'b';
  } else if (type === 'estimation') {
    problem.estimationRanges = createEstimationRanges(problem.answer);
  }

  return problem;
}

/**
 * Генератор "Лестницы сложности" (Ladder):
 * Паттерн 7 + 8 -> 17 + 8 -> 27 + 8 -> 127 + 8 -> 327 + 8
 */
export function generateLadderSequence(
  operator: Operator = '+',
  stepsCount: number = 5
): Problem[] {
  const problems: Problem[] = [];

  if (operator === '+') {
    const baseA = randomInt(4, 9);
    const baseB = randomInt(5, 9);
    const prefixes = [0, 10, 20, 100, 300];

    for (let i = 0; i < stepsCount; i++) {
      const a = prefixes[i] + baseA;
      const b = baseB;
      const answer = a + b;
      const level: DifficultyLevel = a < 10 ? 1 : a < 100 ? 2 : 3;
      problems.push({
        id: `ladder-${i}-${Date.now()}-${randomInt(100, 999)}`,
        a,
        operator: '+',
        operation: 'addition',
        b,
        answer,
        level,
        tags: analyzeSkillTags('addition', a, b, answer),
        type: 'standard',
      });
    }
  } else if (operator === '×') {
    const baseA = randomInt(6, 9);
    const baseB = randomInt(3, 9);
    const multipliers = [baseA, 10 + baseA, 20 + baseA, 100 + baseA, 200 + baseA];

    for (let i = 0; i < stepsCount; i++) {
      const a = multipliers[i];
      const b = baseB;
      const answer = a * b;
      const level: DifficultyLevel = a < 10 ? 1 : a < 100 ? 2 : 3;
      problems.push({
        id: `ladder-${i}-${Date.now()}-${randomInt(100, 999)}`,
        a,
        operator: '×',
        operation: 'multiplication',
        b,
        answer,
        level,
        tags: analyzeSkillTags('multiplication', a, b, answer),
        type: 'standard',
      });
    }
  }

  return problems;
}
