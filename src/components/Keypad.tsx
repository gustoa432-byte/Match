import React from 'react';
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
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const handleDigit = (digit: string) => {
    if (disabled) return;
    sound.playClick();
    onKeyPress(digit);
  };

  const handleBack = () => {
    if (disabled) return;
    sound.playClick();
    onBackspace();
  };

  const handleSubmit = () => {
    if (disabled) return;
    sound.playClick();
    onSubmit();
  };

  return (
    <div className="w-full max-w-sm mx-auto grid grid-cols-3 gap-2.5 sm:gap-3 pt-1 pb-3 px-2 select-none font-sans">
      {digits.map((num) => (
        <button
          key={num}
          type="button"
          disabled={disabled}
          onClick={() => handleDigit(num)}
          className="glass-key h-14 sm:h-16 rounded-2xl flex items-center justify-center text-white text-2xl sm:text-3xl font-normal transition-transform active:scale-[0.95] disabled:opacity-50"
        >
          <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{num}</span>
        </button>
      ))}

      {/* Кнопка Backspace (стереть) */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleBack}
        title="Стереть"
        className="glass-key h-14 sm:h-16 rounded-2xl flex items-center justify-center text-zinc-300 hover:text-white transition-transform active:scale-[0.95] disabled:opacity-50"
      >
        <Delete className="w-6 h-6 stroke-[1.8] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
      </button>

      {/* Кнопка 0 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleDigit('0')}
        className="glass-key h-14 sm:h-16 rounded-2xl flex items-center justify-center text-white text-2xl sm:text-3xl font-normal transition-transform active:scale-[0.95] disabled:opacity-50"
      >
        <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">0</span>
      </button>

      {/* Кнопка Enter (неоновый градиент синий-бирюзовый точно по референсу) */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleSubmit}
        title="Подтвердить (Enter)"
        className="glass-enter-key h-14 sm:h-16 rounded-2xl flex items-center justify-center text-white transition-transform active:scale-[0.95] disabled:opacity-50"
      >
        <CornerDownLeft className="w-6 h-6 stroke-[2.5] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
      </button>
    </div>
  );
};
