import React from 'react';
import { DifficultyLevel, Operator } from '../game/generator';
import { TrainingMode } from './Header';
import { Play, Sparkles, BarChart2, Zap, Target, Layers } from 'lucide-react';
import { sound } from '../utils/audio';

interface StartViewProps {
  level: DifficultyLevel;
  allowedOperators: Operator[];
  trainingMode: TrainingMode;
  onStart: () => void;
  onOpenModeSelect: () => void;
  onOpenSkillMap: () => void;
  totalSessions: number;
  bestStreak: number;
}

export const StartView: React.FC<StartViewProps> = ({
  level,
  allowedOperators,
  trainingMode,
  onStart,
  onOpenModeSelect,
  onOpenSkillMap,
  totalSessions,
  bestStreak,
}) => {
  const modeLabels: Record<TrainingMode, string> = {
    adaptive: 'Адаптивный ИИ',
    true_false: 'True / False',
    missing_operator: 'Знак ?',
    missing_number: 'Число ?',
    ladder: 'Лестница',
    estimation: 'Оценка ≈',
    audio: 'Аудио',
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col items-center justify-between w-full max-w-sm sm:max-w-md mx-auto px-3 py-2 sm:py-3 select-none font-sans overflow-hidden">
      {/* Верхний бейдж и статус готовности */}
      <div className="w-full flex items-center justify-between text-xs text-zinc-400 px-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[11px]">
            ГОТОВО К СТАРТУ
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-zinc-400">
          <span>20 задач в серии</span>
        </div>
      </div>

      {/* Центральный визуальный блок: стеклянная карточка с параметрами */}
      <div className="w-full flex flex-col items-center justify-center my-auto py-2">
        {/* Заголовок с неоновым свечением */}
        <div className="relative mb-3 sm:mb-4 text-center">
          <div className="absolute -inset-4 bg-cyan-500/20 blur-xl rounded-full pointer-events-none" />
          <h2 className="relative text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
            MENTAL MATH
          </h2>
          <p className="text-xs sm:text-sm text-cyan-300/80 font-medium mt-0.5">
            Тренировка устного счёта на реакцию
          </p>
        </div>

        {/* Стеклянная информационная панель с выбранными параметрами */}
        <div className="w-full bg-[#121729]/80 border border-white/15 backdrop-blur-md rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col gap-2.5">
          {/* Режим тренировки */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs text-zinc-400">Режим:</span>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onOpenModeSelect();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-xs font-semibold text-cyan-200 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{modeLabels[trainingMode]}</span>
              <span className="text-[10px] text-zinc-400 ml-0.5">›</span>
            </button>
          </div>

          {/* Уровень сложности и операции */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/5 rounded-xl p-2 border border-white/5 flex flex-col">
              <span className="text-[10px] text-zinc-400">Сложность</span>
              <span className="font-bold text-white text-sm">УРОВЕНЬ {level}</span>
            </div>
            <div className="bg-white/5 rounded-xl p-2 border border-white/5 flex flex-col">
              <span className="text-[10px] text-zinc-400">Операции</span>
              <span className="font-bold text-cyan-300 font-mono text-sm tracking-wider">
                {allowedOperators.join(' ')}
              </span>
            </div>
          </div>

          {/* Статистика игрока (если есть) */}
          {(totalSessions > 0 || bestStreak > 0) && (
            <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400 font-mono">
              <span>Серий пройдено: <strong className="text-zinc-200">{totalSessions}</strong></span>
              {bestStreak > 0 && (
                <span>Серия 🔥 <strong className="text-amber-400">{bestStreak}</strong></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Нижняя зона: большая кнопка СТАРТ и быстрые действия */}
      <div className="w-full flex flex-col items-center gap-2 pt-1 pb-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            sound.playStart();
            onStart();
          }}
          className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 text-white font-extrabold text-base sm:text-lg tracking-wider flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(6,182,212,0.45)] active:scale-[0.98] transition-all border border-cyan-300/40 cursor-pointer"
        >
          <Play className="w-5 h-5 fill-white" />
          <span>НАЧАТЬ ИГРУ</span>
        </button>

        <div className="w-full flex items-center justify-between text-xs text-zinc-400 px-1">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onOpenSkillMap();
            }}
            className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-emerald-300 transition-colors"
          >
            <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Карта навыков</span>
          </button>

          <span className="text-[11px] text-zinc-500 font-mono">
            Enter / Пробел для старта
          </span>
        </div>
      </div>
    </div>
  );
};
