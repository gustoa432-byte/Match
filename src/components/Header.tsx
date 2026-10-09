import React, { useState } from 'react';
import { DifficultyLevel, Operator } from '../game/generator';
import {
  Volume2,
  VolumeX,
  BarChart2,
  Eye,
  EyeOff,
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
  isCleanMode: boolean;
  onToggleCleanMode: () => void;
  onOpenSkillMap: () => void;
  trainingMode: TrainingMode;
  onSelectTrainingMode: (mode: TrainingMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  level,
  onSelectLevel,
  allowedOperators,
  onToggleOperator,
  isMuted,
  onToggleMute,
  isCleanMode,
  onToggleCleanMode,
  onOpenSkillMap,
  trainingMode,
  onSelectTrainingMode,
}) => {
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
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

          {/* Быстрое меню режимов */}
          <div className="relative">
            <button
              onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
              className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] text-zinc-300 hover:text-white flex items-center gap-1 transition-all"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
              <span>{modeLabels[trainingMode]}</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
            </button>

            {isModeDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsModeDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1.5 w-44 bg-[#0e1326]/95 border border-white/20 backdrop-blur-xl rounded-2xl shadow-2xl py-1.5 z-50 text-xs font-mono">
                  {(Object.keys(modeLabels) as TrainingMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        onSelectTrainingMode(m);
                        setIsModeDropdownOpen(false);
                        sound.playClick();
                      }}
                      className={`w-full text-left px-3 py-1.5 transition-colors flex items-center justify-between ${
                        trainingMode === m
                          ? 'bg-blue-600/30 text-cyan-300 font-semibold'
                          : 'text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      <span>{modeLabels[m]}</span>
                      {trainingMode === m && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Стеклянная капсула в правом верхнем углу со свечением под ней */}
        <div className="relative">
          {/* Фоновое бирюзовое свечение */}
          <div className="absolute -inset-1 bg-cyan-500/25 blur-md rounded-full pointer-events-none" />

          <div className="relative flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md shadow-lg">
            {/* Чистый режим */}
            <button
              onClick={() => {
                onToggleCleanMode();
                sound.playClick();
              }}
              title={isCleanMode ? 'Чистый режим включён' : 'Обычный режим'}
              className="p-0.5 sm:p-1 text-zinc-300 hover:text-white transition-colors"
            >
              {isCleanMode ? (
                <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
              ) : (
                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2]" />
              )}
            </button>

            {/* Звук */}
            <button
              onClick={() => {
                onToggleMute();
                sound.playClick();
              }}
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
              className="p-0.5 sm:p-1 text-zinc-300 hover:text-white transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2] text-cyan-200" />
              )}
            </button>

            {/* Карта навыков / Статистика */}
            <button
              onClick={() => {
                onOpenSkillMap();
                sound.playClick();
              }}
              title="Карта навыков и рекорды"
              className="p-0.5 sm:p-1 text-zinc-300 hover:text-white transition-colors"
            >
              <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2] text-emerald-400" />
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
                onClick={() => {
                  if (level !== lvl) {
                    onSelectLevel(lvl);
                    sound.playClick();
                  }
                }}
                className={`px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all relative ${
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
              onClick={() => {
                onToggleOperator(op);
                sound.playClick();
              }}
              title={`Операция ${op}`}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-xl font-medium transition-all ${
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
