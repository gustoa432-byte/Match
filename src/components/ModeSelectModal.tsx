import React from 'react';
import { TrainingMode } from './Header';
import {
  X,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Hash,
  TrendingUp,
  Compass,
  Volume2,
  Zap,
} from 'lucide-react';
import { sound } from '../utils/audio';

interface ModeOption {
  id: TrainingMode;
  title: string;
  badge: string;
  desc: string;
  icon: React.ReactNode;
}

interface ModeSelectModalProps {
  isOpen: boolean;
  currentMode: TrainingMode;
  onSelectMode: (mode: TrainingMode) => void;
  onClose: () => void;
}

export const ModeSelectModal: React.FC<ModeSelectModalProps> = ({
  isOpen,
  currentMode,
  onSelectMode,
  onClose,
}) => {
  if (!isOpen) return null;

  const modes: ModeOption[] = [
    {
      id: 'adaptive',
      title: 'Адаптивный',
      badge: 'Умный ИИ',
      desc: 'Подбирает примеры персонально под ваши ошибки и слабые места',
      icon: <Zap className="w-4 h-4 text-cyan-400 shrink-0" />,
    },
    {
      id: 'true_false',
      title: 'True / False',
      badge: 'Скорость',
      desc: 'Мгновенная оценка: верно ли математическое равенство (Да / Нет)',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
    {
      id: 'missing_operator',
      title: 'Пропущен знак ?',
      badge: 'Логика',
      desc: 'Определите знак операции (+, −, ×, ÷) между числами',
      icon: <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    {
      id: 'missing_number',
      title: 'Пропущено число ?',
      badge: 'Уравнения',
      desc: 'Найдите неизвестный компонент в выражении: ? + B = C',
      icon: <Hash className="w-4 h-4 text-purple-400 shrink-0" />,
    },
    {
      id: 'ladder',
      title: 'Лестница',
      badge: 'Выносливость',
      desc: 'Серия задач с постепенным нарастанием величины чисел',
      icon: <TrendingUp className="w-4 h-4 text-pink-400 shrink-0" />,
    },
    {
      id: 'estimation',
      title: 'Оценка ≈',
      badge: 'Прикидка',
      desc: 'Быстрый выбор правильного порядка диапазона ответа',
      icon: <Compass className="w-4 h-4 text-blue-400 shrink-0" />,
    },
    {
      id: 'audio',
      title: 'Аудио (на слух)',
      badge: 'Голос',
      desc: 'Восприятие математических задач со звуковым диктором',
      icon: <Volume2 className="w-4 h-4 text-indigo-400 shrink-0" />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none touch-manipulation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          sound.playClick();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-sm sm:max-w-md bg-[#0e1326] border border-cyan-500/30 rounded-2xl p-3.5 sm:p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-2.5 sm:gap-3 font-sans relative z-10 max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Выбор режима тренировки
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Список режимов с большими кликабельными карточками */}
        <div className="flex flex-col gap-1.5 sm:gap-2 overflow-y-auto pr-1 min-h-0 flex-1">
          {modes.map((m) => {
            const isSelected = currentMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelectMode(m.id);
                  onClose();
                }}
                className={`w-full text-left p-2 sm:p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 group cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-cyan-500/30 text-cyan-200'
                        : 'bg-white/5 text-zinc-400 group-hover:text-zinc-200'
                    }`}
                  >
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs sm:text-sm font-bold truncate ${
                          isSelected ? 'text-white' : 'text-zinc-200'
                        }`}
                      >
                        {m.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-cyan-300 shrink-0">
                        {m.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 truncate leading-tight">
                      {m.desc}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 pl-1">
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center text-slate-950 font-bold text-xs shadow-[0_0_8px_rgba(6,182,212,0.8)]">
                      ✓
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-white/20 group-hover:border-white/40" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Подсказка внизу */}
        <div className="pt-1 border-t border-white/10 text-[11px] text-zinc-400 text-center shrink-0">
          Нажмите на любой режим для мгновенного переключения
        </div>
      </div>
    </div>
  );
};
