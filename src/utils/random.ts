/**
 * Криптографически стойкий генератор случайных целых чисел
 * Использует crypto.getRandomValues() без modulo bias
 */
export function randomInt(min: number, max: number): number {
  if (min > max) {
    const temp = min;
    min = max;
    max = temp;
  }
  const range = max - min + 1;
  if (range <= 1) return min;

  const maxUint32 = 0xffffffff;
  // Отсекаем остаток для исключения смещения остатка (modulo bias)
  const limit = maxUint32 - (maxUint32 % range);
  const buffer = new Uint32Array(1);

  let randVal: number;
  do {
    crypto.getRandomValues(buffer);
    randVal = buffer[0];
  } while (randVal >= limit);

  return min + (randVal % range);
}

/**
 * Выбор случайного элемента из массива с помощью crypto.getRandomValues
 */
export function randomChoice<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Массив пуст');
  }
  const index = randomInt(0, items.length - 1);
  return items[index];
}
