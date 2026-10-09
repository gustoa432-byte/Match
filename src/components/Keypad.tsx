import React, { useCallback, useEffect, useRef } from 'react';
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
 *
 * Защита от залипания клавиш (edge-cases):
 * - Снятие `is-pressed` при pointerup / pointerleave / pointercancel
 * - Таймаут безопасности (120 мс) на автоматический сброс активного состояния
 * - Сброс всех активных клавиш при новом тапе, смене disabled или глобальном pointerup/blur
 */
export const Keypad: React.FC<KeypadProps> = React.memo(({
  onKeyPress,
  onBackspace,
  onSubmit,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTimeoutsRef = useRef<Map<HTMLElement, number>>(new Map());

  const clearButtonPress = useCallback((el: HTMLElement) => {
    const tid = activeTimeoutsRef.current.get(el);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      activeTimeoutsRef.current.delete(el);
    }
    el.classList.remove('is-pressed');
  }, []);

  const clearAllPressed = useCallback(() => {
    activeTimeoutsRef.current.forEach((tid) => {
      window.clearTimeout(tid);
    });
    activeTimeoutsRef.current.clear();

    if (containerRef.current) {
      const pressedEls = containerRef.current.querySelectorAll('.is-pressed');
      pressedEls.forEach((el) => {
        el.classList.remove('is-pressed');
      });
    }
  }, []);

  // Сброс залипших клавиш при отключении нампада (блокировка ввода во время анимации ответа)
  useEffect(() => {
    if (disabled) {
      clearAllPressed();
    }
  }, [disabled, clearAllPressed]);

  // Глобальный слушатель отпускания пальца/мыши и потери фокуса окна для 100% исключения залипания
  useEffect(() => {
    const handleGlobalRelease = () => {
      clearAllPressed();
    };

    window.addEventListener('pointerup', handleGlobalRelease, { passive: true });
    window.addEventListener('pointercancel', handleGlobalRelease, { passive: true });
    window.addEventListener('blur', handleGlobalRelease);

    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('blur', handleGlobalRelease);
      clearAllPressed();
    };
  }, [clearAllPressed]);

  const activateButton = useCallback(
    (buttonEl: HTMLButtonElement) => {
      // 1. Сбрасываем другие кнопки перед активацией текущей (защита от мультитача/быстрых слайдов)
      clearAllPressed();

      // 2. Мгновенная визуальная реакция (0ms active state без React re-render)
      buttonEl.classList.add('is-pressed');

      // 3. Таймаут безопасности (120ms): гарантирует возврат кнопки, даже если событие pointerup потеряно браузером
      const tid = window.setTimeout(() => {
        clearButtonPress(buttonEl);
      }, 120);
      activeTimeoutsRef.current.set(buttonEl, tid);
    },
    [clearAllPressed, clearButtonPress]
  );

  const handleKeyPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();

      const btn = e.currentTarget;
      const key = btn.getAttribute('data-key');

      // 1. Мгновенный синхронный ввод цифры
      if (key) {
        onKeyPress(key);
      }

      // 2. Мгновенная физическая реакция кнопки с защитой от залипания
      activateButton(btn);

      // 3. Звук и тактильный отклик (неблокирующий microtask)
      sound.playClick();
    },
    [disabled, onKeyPress, activateButton]
  );

  const handleBackspacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();

      const btn = e.currentTarget;

      // 1. Мгновенное удаление последнего символа
      onBackspace();

      // 2. Мгновенная физическая реакция кнопки с защитой от залипания
      activateButton(btn);

      // 3. Звук клика
      sound.playClick();
    },
    [disabled, onBackspace, activateButton]
  );

  const handleSubmitPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();

      const btn = e.currentTarget;

      // 1. Отправка ответа
      onSubmit();

      // 2. Мгновенная реакция кнопки Enter с защитой от залипания
      activateButton(btn);

      // 3. Звук
      sound.playClick();
    },
    [disabled, onSubmit, activateButton]
  );

  const handlePointerRelease = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      clearButtonPress(e.currentTarget);
    },
    [clearButtonPress]
  );

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
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
          onContextMenu={(e) => e.preventDefault()}
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
        onContextMenu={(e) => e.preventDefault()}
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
        onContextMenu={(e) => e.preventDefault()}
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
        onContextMenu={(e) => e.preventDefault()}
        title="Подтвердить (Enter)"
        className="glass-enter-key h-[clamp(2.7rem,6.2vh,3.5rem)] rounded-xl sm:rounded-2xl flex items-center justify-center text-white select-none disabled:opacity-50"
      >
        <CornerDownLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] pointer-events-none" />
      </button>
    </div>
  );
});
