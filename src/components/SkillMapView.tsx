import React from 'react';
import {
  calculateSkillMap,
  ExtendedStorageData,
  TaskMetric,
} from '../game/storage';
import { X, Target, Zap, Activity, AlertTriangle, ArrowRight } from 'lucide-react';
import { sound } from '../utils/audio';

interface SkillMapViewProps {
  storage: ExtendedStorageData;
  isOpen: boolean;
  onClose: () => void;
  onSelectFocusPractice: (tagOrOp: string) => void;
}

export const SkillMapView: React.FC<SkillMapViewProps> = ({
  storage,
  isOpen,
  onClose,
  onSelectFocusPractice,
}) => {
  if (!isOpen) return null;

  const { operations, patterns, overallFocus, focusExplanation } =
    calculateSkillMap(storage.metricsHistory);

  // Последние 8 тренировок для графика прогресса
  const recentSessions = storage.trainingHistory.slice(-8);

  const activeWeakSpots = (storage.weakSpots || []).filter((w) => !w.isResolved);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 font-mono">
        {/* Шапка модалки */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              КАРТА НАВЫКОВ (SKILL MAP)
            </h3>
          </div>
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Блок Автоматический ФОКУС */}
        <div className="my-4 p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-amber-400 font-semibold tracking-wider uppercase flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> ТЕКУЩИЙ ФОКУС: {overallFocus}
            </span>
            <button
              onClick={() => {
                sound.playClick();
                onSelectFocusPractice(overallFocus);
                onClose();
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded border border-zinc-700 transition-colors flex items-center gap-1"
            >
              <span>Тренировать</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">{focusExplanation}</p>
        </div>

        {/* Раздел: Арифметика (Базовые операции) */}
        <div className="mb-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">
            АРИФМЕТИКА
          </div>
          <div className="space-y-2">
            {operations.map((op) => (
              <div
                key={op.tagOrOp}
                className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-zinc-200">{op.displayName}</span>
                  <div className="flex items-center gap-2">
                    {op.totalSampled > 0 && (
                      <span className="text-zinc-500 text-[11px]">
                        {op.avgSpeedSec}с · {op.accuracyPercent}%
                      </span>
                    )}
                    <span className="font-bold text-zinc-100">{op.masteryPercent}%</span>
                  </div>
                </div>

                {/* Прогресс-бар уверенности навыка */}
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      op.masteryPercent >= 80
                        ? 'bg-emerald-500'
                        : op.masteryPercent >= 60
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${op.masteryPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Раздел: Паттерны вычисления (Переходы и таблица) */}
        <div className="mb-4">
          <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">
            ПАТТЕРНЫ ВЫЧИСЛЕНИЯ
          </div>
          <div className="space-y-2">
            {patterns.map((pat) => (
              <div
                key={pat.tagOrOp}
                className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-zinc-300">{pat.displayName}</span>
                  <div className="flex items-center gap-2">
                    {pat.totalSampled > 0 && (
                      <span className="text-zinc-500 text-[11px]">
                        {pat.avgSpeedSec}с · {pat.accuracyPercent}%
                      </span>
                    )}
                    <span className="font-bold text-zinc-100">{pat.masteryPercent}%</span>
                  </div>
                </div>

                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-300 rounded-full transition-all duration-500"
                    style={{ width: `${pat.masteryPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Слабые места (Weak Spots) */}
        {activeWeakSpots.length > 0 && (
          <div className="mb-4 p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>ОБНАРУЖЕННЫЕ WEAK SPOTS</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeWeakSpots.slice(0, 8).map((ws) => (
                <div
                  key={ws.key}
                  className="px-2 py-1 bg-zinc-900 border border-rose-500/30 rounded text-xs text-zinc-200 flex items-center gap-1.5"
                >
                  <span className="font-bold">{ws.key}</span>
                  <span className="text-[10px] text-zinc-500">({ws.avgResponseTime}с)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Графики прогресса: ACCURACY & SPEED */}
        {recentSessions.length >= 2 && (
          <div className="mb-2 p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
            <div className="text-[11px] text-zinc-500 uppercase tracking-widest mb-3 font-semibold">
              ДИНАМИКА ТРЕНИРОВОК
            </div>

            {/* Скорость и Точность по последним сессиям */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Скорость (сек):</span>
                <span className="text-zinc-200">
                  {recentSessions.map((s) => s.avgTimeSec.toFixed(1)).join(' → ')}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Точность (%):</span>
                <span className="text-emerald-400">
                  {recentSessions.map((s) => `${s.accuracy}%`).join(' → ')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Кнопка закрытия */}
        <div className="pt-3 border-t border-zinc-800 flex justify-end">
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="px-5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
