import React, { useRef, useEffect } from 'react';
import { Problem } from '../game/generator';
import { Keypad } from './Keypad';
import { Check, X, Volume2, Keyboard, Smartphone } from 'lucide-react';
import { speakProblemRussian } from '../training/speech';
import { sound } from '../utils/audio';

interface ProblemViewProps {
  problem: Problem;
  problemIndex: number;
  totalProblems: number;
  currentInput: string;
  onInputChange: (val: string) => void;
  onSubmit: (customAnswer?: string | number) => void;
  feedbackState: 'none' | 'correct' | 'wrong';
  lastWrongAnswer?: number | string | null;
  elapsedSeconds: number;
  streak: number;
  isCleanMode: boolean;
  virtualKeypadOnly: boolean;
  onToggleKeyboardMode: () => void;
  isAudioMode: boolean;
}

export const ProblemView: React.FC<ProblemViewProps> = ({
  problem,
  problemIndex,
  totalProblems,
  currentInput,
  onInputChange,
  onSubmit,
  feedbackState,
  lastWrongAnswer,
  elapsedSeconds,
  streak,
  isCleanMode,
  virtualKeypadOnly,
  onToggleKeyboardMode,
  isAudioMode,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (feedbackState === 'none' && !virtualKeypadOnly) {
      inputRef.current?.focus();
    }
  }, [problem.id, feedbackState, virtualKeypadOnly]);

  useEffect(() => {
    if (isAudioMode && feedbackState === 'none') {
      speakProblemRussian(problem.a, problem.operator, problem.b);
    }
  }, [problem.id, isAudioMode, feedbackState, problem.a, problem.operator, problem.b]);

  const handleNativeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  };

  const isLocked = feedbackState !== 'none';
  const displayOperator = problem.operator === '−' ? '-' : problem.operator;

  // Форматирование таймера в виде 00:03.9 как в референсе
  const mins = Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (elapsedSeconds % 60).toFixed(1).padStart(4, '0');
  const formattedTimer = `${mins}:${secs}`;

  return (
    <div className="flex-1 flex flex-col items-center justify-between w-full max-w-sm sm:max-w-md mx-auto px-3 py-1 select-none font-sans">
      {/* Строка прогресса и таймера точно как в референсе: "LEVEL 1 · 1 / 20" и "00:03.9" */}
      <div className="w-full flex items-center justify-between text-xs sm:text-sm text-zinc-400 px-1 pt-1">
        <div className="flex items-center gap-1.5 tracking-wider">
          <span className="font-semibold text-zinc-300 uppercase">
            {problem.type === 'true_false'
              ? 'TRUE / FALSE'
              : problem.type === 'missing_operator'
              ? 'ЗНАК ?'
              : problem.type === 'missing_number'
              ? 'ЧИСЛО ?'
              : problem.type === 'estimation'
              ? 'ОЦЕНКА ≈'
              : `LEVEL ${problem.level}`}
          </span>
          <span>·</span>
          <span className="text-zinc-300 font-mono">
            {problemIndex} / {totalProblems}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {streak >= 3 && (
            <span className="text-amber-400 font-bold text-xs flex items-center gap-0.5">
              🔥 {streak}
            </span>
          )}

          <span className="font-mono text-cyan-200/90 tracking-wider tabular-nums text-xs sm:text-sm">
            {formattedTimer}
          </span>
        </div>
      </div>

      {/* Центральная зона: Математическое выражение */}
      <div className="w-full flex-1 flex flex-col items-center justify-center py-2 sm:py-4 min-h-[190px]">
        {/* Кнопка повторного проговаривания для Audio Mode */}
        {isAudioMode && (
          <button
            type="button"
            onClick={() => speakProblemRussian(problem.a, problem.operator, problem.b)}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs text-cyan-300 hover:text-white mb-3 backdrop-blur-md"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Повторить голос</span>
          </button>
        )}

        {/* Выражение в зависимости от режима */}
        {problem.type === 'estimation' ? (
          <div className="flex flex-col items-center my-2">
            <div className="text-5xl sm:text-6xl font-bold tracking-tight text-white flex items-center justify-center gap-4 drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              <span>{problem.a}</span>
              <span className="text-zinc-300 font-normal">{displayOperator}</span>
              <span>{problem.b}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-cyan-400 font-bold text-2xl drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]">
                ≈ ?
              </span>
              <span className="text-zinc-400 text-xs sm:text-sm font-medium">Оцените диапазон</span>
            </div>
          </div>
        ) : problem.type === 'true_false' ? (
          <div className="flex flex-col items-center my-2">
            <div className="text-5xl sm:text-6xl font-bold tracking-tight text-white flex items-center justify-center gap-3 drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              <span>{problem.a}</span>
              <span className="text-zinc-300 font-normal">{displayOperator}</span>
              <span>{problem.b}</span>
              <span className="text-zinc-400">=</span>
              <span className="text-amber-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.5)]">
                {problem.proposedAnswer}
              </span>
            </div>
            <span className="text-zinc-400 text-xs sm:text-sm mt-2">= ?</span>
          </div>
        ) : problem.type === 'missing_operator' ? (
          <div className="flex flex-col items-center my-2">
            <div className="text-5xl sm:text-6xl font-bold tracking-tight text-white flex items-center justify-center gap-3 drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              <span>{problem.a}</span>
              <span className="text-cyan-400 font-bold border-b-2 border-cyan-400 px-2 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]">
                ?
              </span>
              <span>{problem.b}</span>
              <span className="text-zinc-400">=</span>
              <span>{problem.answer}</span>
            </div>
            <span className="text-zinc-400 text-xs sm:text-sm mt-2">Какая операция?</span>
          </div>
        ) : problem.type === 'missing_number' ? (
          <div className="flex flex-col items-center my-2">
            <div className="text-5xl sm:text-6xl font-bold tracking-tight text-white flex items-center justify-center gap-3 drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              <span>{problem.missingSlot === 'a' ? '?' : problem.a}</span>
              <span className="text-zinc-300 font-normal">{displayOperator}</span>
              <span>{problem.missingSlot === 'b' ? '?' : problem.b}</span>
              <span className="text-zinc-400">=</span>
              <span>{problem.answer}</span>
            </div>
            <span className="text-zinc-400 text-xs sm:text-sm mt-2">Найди пропущенное число</span>
          </div>
        ) : (
          <div className="flex flex-col items-center my-2">
            {/* Огромное выражение с мягким белым свечением как в референсе "7 - 2" */}
            <div className="text-6xl sm:text-7xl font-bold tracking-normal text-white flex items-center justify-center gap-4 drop-shadow-[0_0_30px_rgba(255,255,255,0.45)]">
              <span>{problem.a}</span>
              <span className="text-zinc-300 font-normal">{displayOperator}</span>
              <span>{problem.b}</span>
            </div>

            {/* Знак "= ?" под выражением */}
            <div className="h-6 flex items-center justify-center text-zinc-400 font-medium text-base sm:text-lg mt-2">
              {feedbackState === 'none' && <span>= ?</span>}
            </div>
          </div>
        )}

        {/* Радужная стеклянная рамка ввода или кнопки выбора диапазона */}
        <div className="w-full max-w-xs sm:max-w-sm mt-3 flex flex-col items-center">
          {feedbackState === 'none' ? (
            problem.type === 'estimation' && problem.estimationRanges ? (
              <div className="w-full flex flex-col gap-2 mt-1">
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {problem.estimationRanges.map((r, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        onSubmit(r.label);
                      }}
                      className="glass-key h-14 sm:h-16 rounded-2xl flex flex-col items-center justify-center px-2 py-1 text-white font-mono text-sm sm:text-base font-bold transition-all active:scale-95 hover:border-cyan-400/60 shadow-lg"
                    >
                      <span className="text-[10px] text-zinc-400 font-sans font-normal uppercase tracking-wider mb-0.5">
                        [{idx + 1}]
                      </span>
                      <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] whitespace-nowrap">
                        {r.label}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="text-center text-[10px] text-zinc-500 font-sans pt-1">
                  Нажмите на вариант или клавиши 1, 2, 3, 4
                </div>
              </div>
            ) : problem.type === 'true_false' ? (
              <div className="w-full grid grid-cols-2 gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => onSubmit('true')}
                  className="h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95 transition-all"
                >
                  ВЕРНО
                </button>
                <button
                  type="button"
                  onClick={() => onSubmit('false')}
                  className="h-14 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(244,63,94,0.4)] active:scale-95 transition-all"
                >
                  НЕВЕРНО
                </button>
              </div>
            ) : problem.type === 'missing_operator' ? (
              <div className="w-full grid grid-cols-4 gap-2 mt-1">
                {(['+', '−', '×', '÷'] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => onSubmit(op)}
                    className="glass-key h-14 rounded-2xl text-white font-bold text-2xl active:scale-95 transition-all"
                  >
                    {op === '−' ? '-' : op}
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full relative">
                {virtualKeypadOnly ? (
                  // Стилизованное поле с радужной каймой, текстом "Введите ответ" и мигающим курсором
                  <div
                    tabIndex={0}
                    className="iridescent-input-border w-full h-15 sm:h-16 rounded-2xl flex items-center justify-center px-4"
                  >
                    {currentInput.length > 0 ? (
                      <span className="text-white text-3xl sm:text-4xl font-mono tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]">
                        {currentInput}
                      </span>
                    ) : (
                      <div className="flex items-center justify-center text-zinc-400 text-xl sm:text-2xl font-light">
                        <span>{isCleanMode ? 'Считай в уме' : 'Введите ответ'}</span>
                        <span className="w-0.5 h-6 bg-cyan-400 ml-1.5 blinking-cursor shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="iridescent-input-border w-full h-15 sm:h-16 rounded-2xl relative flex items-center">
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      value={currentInput}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        onInputChange(cleaned);
                      }}
                      onKeyDown={handleNativeKeyDown}
                      placeholder={isCleanMode ? 'Считай в уме...' : 'Введите ответ'}
                      className="w-full h-full bg-transparent text-center text-3xl sm:text-4xl text-white outline-none font-mono placeholder:text-zinc-500 placeholder:text-xl"
                    />
                  </div>
                )}
              </div>
            )
          ) : feedbackState === 'correct' ? (
            // Вспышка верного ответа со свечением
            <div className="h-15 sm:h-16 w-full flex items-center justify-center bg-emerald-950/70 border-2 border-emerald-400/80 rounded-2xl text-emerald-300 font-bold gap-2 shadow-[0_0_30px_rgba(16,185,129,0.6)] animate-in fade-in zoom-in-95 duration-100 px-3">
              <Check className="w-6 h-6 stroke-[3.5] text-emerald-300 shrink-0" />
              <span className="text-sm sm:text-base font-mono truncate">
                {problem.type === 'estimation'
                  ? `${problem.estimationRanges?.find((r) => r.isCorrect)?.label} (точно ${problem.answer.toLocaleString('ru-RU')})`
                  : problem.answer}
              </span>
            </div>
          ) : (
            // Вспышка ошибки со свечением и показом правильного ответа
            <div className="h-15 sm:h-16 w-full flex items-center justify-center bg-rose-950/70 border-2 border-rose-500/80 rounded-2xl text-rose-300 px-3 shadow-[0_0_30px_rgba(244,63,94,0.6)] animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold truncate">
                <X className="w-5 h-5 stroke-[3] text-rose-400 shrink-0" />
                <span className="line-through text-rose-300/80">
                  {String(lastWrongAnswer ?? currentInput)}
                </span>
                <span className="text-zinc-400 text-xs">→</span>
                <span className="text-emerald-300 font-mono">
                  {problem.type === 'estimation'
                    ? `${problem.estimationRanges?.find((r) => r.isCorrect)?.label} (точно ${problem.answer.toLocaleString('ru-RU')})`
                    : problem.answer}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Экранный нампад со стеклянными клавишами точно как в референсе */}
      {(!problem.type || problem.type === 'standard' || problem.type === 'missing_number') && (
        <div className="w-full mt-auto">
          <Keypad
            disabled={isLocked}
            onKeyPress={(digit) => {
              if (currentInput.length < 6) {
                onInputChange(currentInput + digit);
              }
            }}
            onBackspace={() => {
              onInputChange(currentInput.slice(0, -1));
            }}
            onSubmit={() => onSubmit()}
          />
        </div>
      )}
    </div>
  );
};
