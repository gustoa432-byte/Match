import React, { useEffect, useState } from 'react';
import { DifficultyLevel, Problem, OperationName } from '../game/generator';
import {
  RotateCcw,
  ArrowRight,
  Trophy,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
  Flame,
} from 'lucide-react';
import { sound } from '../utils/audio';

export interface SolvedItem {
  problem: Problem;
  userAnswer: number | string | null;
  isCorrect: boolean;
  timeSpentMs: number;
}

interface ResultViewProps {
  level: DifficultyLevel;
  totalProblems: number;
  correctCount: number;
  wrongCount: number;
  averageTimeSec: number;
  bestStreak: number;
  history: SolvedItem[];
  isNewBestScore: boolean;
  isNewBestTime: boolean;
  onPlayAgain: () => void;
  onNextLevel?: () => void;
  onOpenSkillMap: () => void;
  onStartFocusPractice: (opName: string) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  level,
  totalProblems,
  correctCount,
  wrongCount,
  averageTimeSec,
  bestStreak,
  history,
  isNewBestScore,
  isNewBestTime,
  onPlayAgain,
  onNextLevel,
  onOpenSkillMap,
  onStartFocusPractice,
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const percentage = Math.round((correctCount / totalProblems) * 100);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sound.playClick();
        onPlayAgain();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPlayAgain]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm sm:max-w-md mx-auto px-3 py-2 select-none animate-in fade-in zoom-in-95 duration-200 font-sans">
      {/* Верхняя строка: "LEVEL 1 · СЕРИЯ ЗАВЕРШЕНА" точно как в референсе 1 */}
      <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 uppercase tracking-widest mb-1.5 font-medium">
        <span>LEVEL {level}</span>
        <span>·</span>
        <span>СЕРИЯ ЗАВЕРШЕНА</span>
      </div>

      {/* Огромный счёт "18 / 20" с белым сиянием (bloom) как в референсе */}
      <div className="text-7xl sm:text-8xl font-bold text-white tracking-tight my-1 drop-shadow-[0_0_35px_rgba(255,255,255,0.7)] flex items-baseline justify-center gap-3">
        <span>{correctCount}</span>
        <span className="text-zinc-400 font-light text-5xl sm:text-6xl">/</span>
        <span className="text-zinc-200 font-normal text-6xl sm:text-7xl">{totalProblems}</span>
      </div>

      {/* Процент "90%" */}
      <div className="text-2xl sm:text-3xl font-light text-zinc-300 mb-4 tracking-wide">
        {percentage}%
      </div>

      {/* Золотой бейдж рекорда "🏆 НОВЫЙ РЕКОРД СЧЁТА!" точно как в референсе */}
      {(isNewBestScore || isNewBestTime || correctCount >= 16) && (
        <div className="mb-5 gold-record-badge px-5 py-2 rounded-full text-xs sm:text-sm font-semibold tracking-wide flex items-center gap-2">
          <span className="text-base">🏆</span>
          <span>
            {isNewBestScore
              ? 'НОВЫЙ РЕКОРД СЧЁТА!'
              : isNewBestTime
              ? 'ЛУЧШЕЕ ВРЕМЯ РЕАКЦИИ!'
              : 'ОТЛИЧНЫЙ РЕЗУЛЬТАТ!'}
          </span>
        </div>
      )}

      {/* Стеклянная плашка с 3 метриками и неоновыми уголками как в референсе */}
      <div className="w-full relative rounded-3xl p-4 mb-5 border border-white/15 bg-white/5 backdrop-blur-xl shadow-2xl">
        {/* Неоновые угловые отблески (розовый справа, бирюзовый слева) */}
        <div className="absolute -top-1 -right-1 w-20 h-20 bg-pink-500/20 blur-xl pointer-events-none rounded-full" />
        <div className="absolute -bottom-1 -left-1 w-20 h-20 bg-cyan-500/20 blur-xl pointer-events-none rounded-full" />

        <div className="relative grid grid-cols-3 divide-x divide-white/10 text-center">
          {/* СР. ВРЕМЯ */}
          <div className="flex flex-col items-center justify-center px-1">
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 uppercase tracking-wider mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span>СР. ВРЕМЯ</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {averageTimeSec.toFixed(1)}{' '}
              <span className="text-xs text-zinc-400 font-normal">сек</span>
            </div>
          </div>

          {/* ОШИБКИ */}
          <div className="flex flex-col items-center justify-center px-1">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1">
              ОШИБКИ
            </div>
            <div
              className={`text-xl sm:text-2xl font-bold tracking-tight ${
                wrongCount > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {wrongCount}
            </div>
          </div>

          {/* СЕРИЯ */}
          <div className="flex flex-col items-center justify-center px-1">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider mb-1">
              СЕРИЯ
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xl sm:text-2xl font-bold text-amber-400 tracking-tight">
              <span>🔥</span>
              <span>{bestStreak}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки действий точно как в референсе 1 */}
      <div className="w-full flex flex-col gap-3 font-sans">
        {/* Кнопка 1: Хромированная глянцевая кнопка "ЕЩЁ РАЗ" */}
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onPlayAgain();
          }}
          className="chrome-again-btn w-full h-14 sm:h-15 rounded-2xl flex items-center justify-center gap-2 text-base sm:text-lg font-bold tracking-wide"
        >
          <RotateCcw className="w-5 h-5 stroke-[2.5]" />
          <span>ЕЩЁ РАЗ</span>
        </button>

        {/* Кнопка 2: Неоновая бирюзово-синяя кнопка "ПЕРЕЙТИ К LEVEL 2 →" */}
        {level < 3 && onNextLevel ? (
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onNextLevel();
            }}
            className="cyan-next-btn w-full h-14 sm:h-15 rounded-2xl flex items-center justify-center gap-2 text-base sm:text-lg font-bold tracking-wide"
          >
            <span>ПЕРЕЙТИ К LEVEL {level + 1}</span>
            <ArrowRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onOpenSkillMap();
            }}
            className="cyan-next-btn w-full h-14 sm:h-15 rounded-2xl flex items-center justify-center gap-2 text-base sm:text-lg font-bold tracking-wide"
          >
            <Activity className="w-5 h-5 stroke-[2.5]" />
            <span>КАРТА НАВЫКОВ</span>
          </button>
        )}

        {/* Кнопка 3: Стеклянная пилюля "Показать историю примеров ∨" точно как в референсе */}
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setShowBreakdown(!showBreakdown);
            }}
            className="w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-300 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-all shadow-sm"
          >
            <span>
              {showBreakdown ? 'Скрыть историю примеров' : 'Показать историю примеров'}
            </span>
            {showBreakdown ? (
              <ChevronUp className="w-4 h-4 text-cyan-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-cyan-400" />
            )}
          </button>
        )}
      </div>

      {/* Раскрывающийся список истории примеров */}
      {showBreakdown && history.length > 0 && (
        <div className="w-full mt-3 max-h-52 overflow-y-auto border border-white/15 rounded-2xl bg-[#0d1224]/80 backdrop-blur-xl divide-y divide-white/10 text-xs sm:text-sm font-mono">
          {history.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                {item.isCorrect ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="text-zinc-200">
                  {item.problem.a} {item.problem.operator} {item.problem.b}{' '}
                  {item.problem.type === 'estimation' ? '≈' : '='}
                </span>
                <span className={item.isCorrect ? 'text-white font-bold' : 'text-rose-400 font-bold'}>
                  {String(item.userAnswer ?? '—')}
                </span>
                {!item.isCorrect && (
                  <span className="text-emerald-400 text-xs">
                    (точно: {item.problem.answer.toLocaleString('ru-RU')})
                  </span>
                )}
              </div>
              <div className="text-cyan-300 text-xs tabular-nums">
                {(item.timeSpentMs / 1000).toFixed(1)}с
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
