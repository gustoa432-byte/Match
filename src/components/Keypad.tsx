import React, { useState, useCallback } from 'react';
import { Delete, CornerDownLeft } from 'lucide-react';
import { sound } from '../utils/audio';

interface KeypadProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export const Keypad: React.FC<KeypadProps> = ({
  onKeyPress,
  onBackspace,
  onSubmit,
  disabled = false,
}) => {
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, action: () => void, keyId: string) => {
      if (disabled) return;
      // Предотвращаем симуляцию mouse click, задержку 300мс на мобильных устройствах и зум
      e.preventDefault();

      // 1. Мгновенный синхронный ввод цифры/действия
      action();

      // 2. Мгновенная визуальная реакция кнопки (active state)
      setPressedKey(keyId);

      // 3. Звук и вибрация (не блокируют поток отрисовки)
      sound.playClick();
    },
    [disabled]
  );

  const handlePointerRelease = useCallback(
    (keyId: string) => {
      if (pressedKey === keyId) {
        setPressedKey(null);
      }
    },
    [pressedKey]
  );

  const handlePointerLeave = useCallback(() => {
    setPressedKey(null);
  }, []);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div
      className="w-full max-w-sm mx-auto grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-0.5 pb-1 sm:pb-2 px-1 sm:px-2 select-none font-sans touch-none"
      onPointerLeave={handlePointerLeave}
    >
      {digits.map((num) => {
        const isPressed = pressedKey === num;
        return (
          <button
            key={num}
            type="button"
            disabled={disabled}
            onPointerDown={(e) => handlePointerDown(e, () => onKeyPress(num), num)}
            onPointerUp={() => handlePointerRelease(num)}
            onPointerCancel={() => handlePointerRelease(num)}
            onClick={(e) => e.preventDefault()}
            className={`glass-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl md:text-3xl font-normal select-none disabled:opacity-50 ${
              isPressed ? 'is-pressed' : ''
            }`}
          >
            <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none">{num}</span>
          </button>
        );
      })}

      {/* Кнопка Backspace (стереть) */}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => handlePointerDown(e, onBackspace, 'backspace')}
        onPointerUp={() => handlePointerRelease('backspace')}
        onPointerCancel={() => handlePointerRelease('backspace')}
        onClick={(e) => e.preventDefault()}
        title="Стереть"
        className={`glass-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-zinc-300 hover:text-white select-none disabled:opacity-50 ${
          pressedKey === 'backspace' ? 'is-pressed' : ''
        }`}
      >
        <Delete className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none" />
      </button>

      {/* Кнопка 0 */}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => handlePointerDown(e, () => onKeyPress('0'), '0')}
        onPointerUp={() => handlePointerRelease('0')}
        onPointerCancel={() => handlePointerRelease('0')}
        onClick={(e) => e.preventDefault()}
        className={`glass-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl md:text-3xl font-normal select-none disabled:opacity-50 ${
          pressedKey === '0' ? 'is-pressed' : ''
        }`}
      >
        <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-none">0</span>
      </button>

      {/* Кнопка Enter (неоновый градиент синий-бирюзовый) */}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => handlePointerDown(e, onSubmit, 'enter')}
        onPointerUp={() => handlePointerRelease('enter')}
        onPointerCancel={() => handlePointerRelease('enter')}
        onClick={(e) => e.preventDefault()}
        title="Подтвердить (Enter)"
        className={`glass-enter-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white select-none disabled:opacity-50 ${
          pressedKey === 'enter' ? 'is-pressed' : ''
        }`}
      >
        <CornerDownLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] pointer-events-none" />
      </button>
    </div>
  );
};
