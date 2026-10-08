/**
 * Разметка тегов навыков для глубокого анализа ошибок и адаптивности
 */
export type SkillTag =
  | 'single_digit'
  | 'two_digit'
  | 'three_digit'
  | 'times_table'
  | 'cross_ten' // Переход через 10 (перенос единиц)
  | 'cross_hundred' // Переход через 100
  | 'borrow_ten' // Заимствование из десятка при вычитании
  | 'borrow_hundred' // Заимствование из сотен при вычитании
  | 'fast_division'
  | 'multi_step';

export interface TaggedExpression {
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division';
  a: number;
  b: number;
  answer: number;
  tags: SkillTag[];
}

/**
 * Определение тегов навыков для математического выражения
 */
export function analyzeSkillTags(
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division',
  a: number,
  b: number,
  answer: number
): SkillTag[] {
  const tags: SkillTag[] = [];

  // Разрядность
  const maxOperand = Math.max(a, b);
  if (maxOperand <= 9) {
    tags.push('single_digit');
  } else if (maxOperand <= 99) {
    tags.push('two_digit');
  } else {
    tags.push('three_digit');
  }

  switch (operation) {
    case 'addition': {
      // Проверка перехода через 10
      const aUnits = a % 10;
      const bUnits = b % 10;
      if (aUnits + bUnits >= 10) {
        tags.push('cross_ten');
      }
      // Проверка перехода через 100
      const aTens = a % 100;
      const bTens = b % 100;
      if (aTens + bTens >= 100) {
        tags.push('cross_hundred');
      }
      break;
    }

    case 'subtraction': {
      // Проверка заёма из десятка (единицы уменьшаемого меньше единиц вычитаемого)
      const aUnits = a % 10;
      const bUnits = b % 10;
      if (aUnits < bUnits) {
        tags.push('borrow_ten');
        tags.push('cross_ten');
      }
      // Проверка заёма из сотни
      const aTens = a % 100;
      const bTens = b % 100;
      if (aTens < bTens) {
        tags.push('borrow_hundred');
        tags.push('cross_hundred');
      }
      break;
    }

    case 'multiplication': {
      if (a <= 9 && b <= 9) {
        tags.push('times_table');
      } else {
        tags.push('multi_step');
      }
      break;
    }

    case 'division': {
      if (b <= 9 && answer <= 9) {
        tags.push('times_table');
      } else {
        tags.push('fast_division');
      }
      break;
    }
  }

  return tags;
}
