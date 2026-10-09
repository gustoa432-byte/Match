import React from 'react';
import { DifficultyLevel, Operator } from '../game/generator';
import {
  Volume2,
  VolumeX,
  BarChart2,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { sound } from '../utils/audio';

export type TrainingMode =
  | 'adaptive'
  | 'true_false'
  | 'missing_operator'
  | 'missing_number'
  | 'ladder'
  | 'estimation'
  | 'audio';

interface HeaderProps {
  level: DifficultyLevel;
  onSelectLevel: (level: DifficultyLevel) => void;
  allowedOperators: Operator[];
  onToggleOperator: (op: Operator) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenSkillMap: () => void;
  trainingMode: TrainingMode;
  onOpenModeSelect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  level,
  onSelectLevel,
  allowedOperators,
  onToggleOperator,
  isMuted,
  onToggleMute,
  onOpenSkillMap,
  trainingMode,
  onOpenModeSelect,
}) => {
  const allOperators: Operator[] = ['+', '−', '×', '÷'];

  const modeLabels: Record<TrainingMode, string> = {
    adaptive: 'Адаптивный',
    true_false: 'True / False',
    missing_operator: 'Знак ?',
    missing_number: 'Число ?',
    ladder: 'Лестница',
    estimation: 'Оценка ≈',
    audio: 'Аудио',
  };

  return (
    <header className="w-full max-w-sm sm:max-w-md mx-auto pt-2 sm:pt-4 pb-1 sm:pb-2 px-3 flex flex-col gap-1.5 sm:gap-2.5 font-sans select-none shrink-0">
      {/* Верхняя строка: MENTAL MATH и стеклянный островок с иконками */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm sm:text-base font-bold tracking-wider text-white">
            MENTAL MATH
          </span>

          {/* Быстрое меню режимов - открывает надежное модальное окно */}
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onOpenModeSelect();
            }}
            className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[11px] font-medium text-cyan-200 hover:text-white flex items-center gap-1 transition-all cursor-pointer active:scale-95"
            title="Выбрать режим тренировки"
          >
            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            <span>{modeLabels[trainingMode]}</span>
            <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
          </button>
        </div>

        {/* Стеклянная капсула в правом верхнем углу со свечением под ней */}
        <div className="relative">
          {/* Фоновое бирюзовое свечение */}
          <div className="absolute -inset-1 bg-cyan-500/25 blur-md rounded-full pointer-events-none" />

          <div className="relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md shadow-lg">
            {/* Звук */}
            <button
              type="button"
              onClick={() => {
                onToggleMute();
                sound.playClick();
              }}
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
              className="p-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 stroke-[2] text-cyan-200" />
              )}
            </button>

            {/* Карта навыков / Статистика */}
            <button
              type="button"
              onClick={() => {
                onOpenSkillMap();
                sound.playClick();
              }}
              title="Карта навыков и рекорды"
              className="p-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <BarChart2 className="w-3.5 h-3.5 stroke-[2] text-emerald-400" />
            </button>
          </div>
        </div>
      </div>
      {/* Вторая строка: Переключатель уровней в стеклянной капсуле */}
      <div className="flex items-center">
        <div className="p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-white/5 border border-white/15 backdrop-blur-md flex items-center gap-1 shadow-inner">
          {([1, 2, 3] as DifficultyLevel[]).map((lvl) => {
            const isActive = level === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  if (level !== lvl) {
                    onSelectLevel(lvl);
                    sound.playClick();
                  }
                }}
                className={`px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all relative cursor-pointer ${
                  isActive
                    ? 'active-level-glow'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                LEVEL {lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Третья строка: 4 квадратных кнопки операций [+] [−] [×] [÷] */}
      <div className="flex items-center gap-1.5 sm:gap-2 pt-0 sm:pt-0.5">
        {allOperators.map((op) => {
          const isSelected = allowedOperators.includes(op);
          const displayChar = op === '−' ? '-' : op;
          return (
            <button
              key={op}
              type="button"
              onClick={() => {
                onToggleOperator(op);
                sound.playClick();
              }}
              title={`Операция ${op}`}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-xl font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'active-op-glow text-white'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400'
              }`}
            >
              <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{displayChar}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
