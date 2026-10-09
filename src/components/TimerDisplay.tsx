import React, { useRef, useEffect } from 'react';

interface TimerDisplayProps {
  startTime: number;
  isRunning?: boolean;
}

/**
 * Изолированный высокопроизводительный таймер.
 * Обновляет DOM напрямую через textContent по requestAnimationFrame без ре-рендеров React.
 * Устраняет фоновую нагрузку и интервалы 80мс на главном потоке.
 */
export const TimerDisplay: React.FC<TimerDisplayProps> = React.memo(({
  startTime,
  isRunning = true,
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let animId: number;
    let lastFormatted = '';

    const updateTimer = () => {
      if (spanRef.current) {
        const elapsed = Math.max(0, (performance.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60)
          .toString()
          .padStart(2, '0');
        const secs = (elapsed % 60).toFixed(1).padStart(4, '0');
        const formatted = `${mins}:${secs}`;
        if (formatted !== lastFormatted) {
          lastFormatted = formatted;
          spanRef.current.textContent = formatted;
        }
      }
      if (isRunning) {
        animId = requestAnimationFrame(updateTimer);
      }
    };

    updateTimer();
    if (isRunning) {
      animId = requestAnimationFrame(updateTimer);
    }

    return () => {
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, [startTime, isRunning]);

  return (
    <span
      ref={spanRef}
      className="font-mono text-cyan-200/90 tracking-wider tabular-nums text-xs sm:text-sm"
    >
      00:00.0
    </span>
  );
});
