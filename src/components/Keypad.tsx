import React, { useCallback } from 'react';
import { Delete, CornerDownLeft } from 'lucide-react';
import { sound } from '../utils/audio';

interface KeypadProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Высокопроизводительный стеклянный нампад.
 * Мемоизирован через React.memo. Не имеет внутреннего useState, что исключает лишние
 * ре-рендеры при тапах: класс `is-pressed` добавляется напрямую к кнопке на 0мс,
 * а ввод в состояние родителя и воспроизведение звука происходят мгновенно.
 */
export const Keypad: React.FC<KeypadProps> = React.memo(({
  onKeyPress,
  onBackspace,
  onSubmit,
  disabled = false,
}) => {
  const handleKeyPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();

      const key = e.currentTarget.getAttribute('data-key');
      if (key) {
        // 1. Мгновенный синхронный ввод цифры
        onKeyPress(key);
      }

      // 2. Мгновенная визуальная реакция кнопки (0ms active state без React re-render)
      e.currentTarget.classList.add('is-pressed');

      // 3. Звук и тактильный отклик (неблокирующий microtask)
      sound.playClick();
    },
    [disabled, onKeyPress]
  );

  const handleBackspacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();

      // 1. Мгновенное удаление последнего символа
      onBackspace();

      // 2. Мгновенная физическая реакция
      e.currentTarget.classList.add('is-pressed');

      // 3. Звук клика
      sound.playClick();
    },
    [disabled, onBackspace]
  );

  const handleSubmitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();

      // 1. Отправка ответа
      onSubmit();

      // 2. Мгновенная реакция кнопки Enter
      e.currentTarget.classList.add('is-pressed');

      // 3. Звук
      sound.playClick();
    },
    [disabled, onSubmit]
  );

  const handlePointerRelease = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.classList.remove('is-pressed');
  }, []);

  return (
    <div
      className="w-full max-w-sm mx-auto grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-0.5 pb-1 sm:pb-2 px-1 sm:px-2 select-none font-sans touch-none"
    >
      {DIGITS.map((num) => (
        <button
          key={num}
          type="button"
          data-key={num}
          disabled={disabled}
          onPointerDown={handleKeyPointerDown}
          onPointerUp={handlePointerRelease}
          onPointerLeave={handlePointerRelease}
          onPointerCancel={handlePointerRelease}
          onClick={(e) => e.preventDefault()}
          className="glass-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl md:text-3xl font-normal select-none disabled:opacity-50"
        >
          <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none">{num}</span>
        </button>
      ))}

      {/* Кнопка Backspace (стереть) */}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handleBackspacePointerDown}
        onPointerUp={handlePointerRelease}
        onPointerLeave={handlePointerRelease}
        onPointerCancel={handlePointerRelease}
        onClick={(e) => e.preventDefault()}
        title="Стереть"
        className="glass-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-zinc-300 hover:text-white select-none disabled:opacity-50"
      >
        <Delete className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none" />
      </button>

      {/* Кнопка 0 */}
      <button
        type="button"
        data-key="0"
        disabled={disabled}
        onPointerDown={handleKeyPointerDown}
        onPointerUp={handlePointerRelease}
        onPointerLeave={handlePointerRelease}
        onPointerCancel={handlePointerRelease}
        onClick={(e) => e.preventDefault()}
        className="glass-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl md:text-3xl font-normal select-none disabled:opacity-50"
      >
        <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none">0</span>
      </button>

      {/* Кнопка Enter (неоновый градиент синий-бирюзовый) */}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handleSubmitPointerDown}
        onPointerUp={handlePointerRelease}
        onPointerLeave={handlePointerRelease}
        onPointerCancel={handlePointerRelease}
        onClick={(e) => e.preventDefault()}
        title="Подтвердить (Enter)"
        className="glass-enter-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white select-none disabled:opacity-50"
      >
        <CornerDownLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] pointer-events-none" />
      </button>
    </div>
  );
});
