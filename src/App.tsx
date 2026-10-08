/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DifficultyLevel,
  Operator,
  Problem,
  generateProblem,
  generateLadderSequence,
} from './game/generator';
import {
  loadExtendedData,
  saveExtendedData,
  ExtendedStorageData,
  TaskMetric,
  TrainingSessionRecord,
} from './game/storage';
import { adaptiveEngine } from './training/adaptiveEngine';
import { sound } from './utils/audio';
import { Header, TrainingMode } from './components/Header';
import { ProblemView } from './components/ProblemView';
import { ResultView, SolvedItem } from './components/ResultView';
import { SkillMapView } from './components/SkillMapView';
import { CosmicParticles } from './components/CosmicParticles';

const PROBLEMS_PER_SESSION = 20;

export default function App() {
  const [storage, setStorage] = useState<ExtendedStorageData>(loadExtendedData);
  const [level, setLevel] = useState<DifficultyLevel>(1);
  const [allowedOperators, setAllowedOperators] = useState<Operator[]>([
    '+',
    '−',
    '×',
    '÷',
  ]);
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('adaptive');

  // Настройки
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getMuted());
  const [isCleanMode, setIsCleanMode] = useState<boolean>(
    () => storage.settings.cleanMode
  );
  const [virtualKeypadOnly, setVirtualKeypadOnly] = useState<boolean>(
    () => storage.settings.virtualKeypadOnly
  );

  // Игровое состояние
  const [currentProblem, setCurrentProblem] = useState<Problem>(() =>
    generateProblem({ level: 1, allowedOperators: ['+', '−', '×', '÷'] })
  );
  const [ladderQueue, setLadderQueue] = useState<Problem[]>([]);
  const [problemIndex, setProblemIndex] = useState<number>(1);
  const [currentInput, setCurrentInput] = useState<string>('');
  const [feedbackState, setFeedbackState] = useState<'none' | 'correct' | 'wrong'>('none');
  const [lastWrongAnswer, setLastWrongAnswer] = useState<number | string | null>(null);

  // Статистика текущей серии
  const [history, setHistory] = useState<SolvedItem[]>([]);
  const [recentProblems, setRecentProblems] = useState<Problem[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [sessionMaxStreak, setSessionMaxStreak] = useState<number>(0);
  const [isSessionFinished, setIsSessionFinished] = useState<boolean>(false);

  // Точный таймер
  const problemStartTimeRef = useRef<number>(performance.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const timerIntervalRef = useRef<number | null>(null);

  // Карта навыков
  const [isSkillMapOpen, setIsSkillMapOpen] = useState<boolean>(false);
  const [lastBestInfo, setLastBestInfo] = useState<{
    isNewBestScore: boolean;
    isNewBestTime: boolean;
  }>({ isNewBestScore: false, isNewBestTime: false });

  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    problemStartTimeRef.current = performance.now();
    setElapsedSeconds(0);

    timerIntervalRef.current = window.setInterval(() => {
      const now = performance.now();
      setElapsedSeconds((now - problemStartTimeRef.current) / 1000);
    }, 80);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const fetchNextProblem = useCallback(
    (
      targetLevel: DifficultyLevel,
      probIdx: number,
      mode: TrainingMode,
      currentStorage: ExtendedStorageData,
      recents: Problem[]
    ): Problem => {
      if (mode === 'ladder') {
        const ladder = generateLadderSequence('+', 5);
        setLadderQueue(ladder.slice(1));
        return ladder[0];
      }

      if (mode === 'true_false') {
        return generateProblem({
          level: targetLevel,
          allowedOperators,
          problemType: 'true_false',
          recentProblems: recents,
        });
      }

      if (mode === 'missing_operator') {
        return generateProblem({
          level: targetLevel,
          allowedOperators,
          problemType: 'missing_operator',
          recentProblems: recents,
        });
      }

      if (mode === 'missing_number') {
        return generateProblem({
          level: targetLevel,
          allowedOperators,
          problemType: 'missing_number',
          recentProblems: recents,
        });
      }

      if (mode === 'estimation') {
        return generateProblem({
          level: targetLevel,
          allowedOperators,
          problemType: 'estimation',
          recentProblems: recents,
        });
      }

      return adaptiveEngine.getNextProblem(
        targetLevel,
        probIdx,
        currentStorage,
        recents,
        allowedOperators
      );
    },
    [allowedOperators]
  );

  const startNewSession = useCallback(
    (targetLevel: DifficultyLevel = level, targetMode: TrainingMode = trainingMode) => {
      stopTimer();
      setProblemIndex(1);
      setHistory([]);
      setRecentProblems([]);
      setStreak(0);
      setSessionMaxStreak(0);
      setCurrentInput('');
      setFeedbackState('none');
      setLastWrongAnswer(null);
      setIsSessionFinished(false);
      setLastBestInfo({ isNewBestScore: false, isNewBestTime: false });

      const first = fetchNextProblem(targetLevel, 1, targetMode, storage, []);
      setCurrentProblem(first);
      startTimer();
    },
    [level, trainingMode, storage, fetchNextProblem, startTimer, stopTimer]
  );

  useEffect(() => {
    startTimer();
    return () => stopTimer();
  }, [startTimer, stopTimer]);

  // Глобальный ввод с физической клавиатуры
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (isSkillMapOpen) {
        if (e.key === 'Escape') setIsSkillMapOpen(false);
        return;
      }

      if (isSessionFinished) return;
      if (feedbackState !== 'none') return;

      if (currentProblem.type === 'true_false') {
        if (e.key === '1' || e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'в') {
          e.preventDefault();
          handleSubmitAnswer('true');
          return;
        }
        if (e.key === '2' || e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'н') {
          e.preventDefault();
          handleSubmitAnswer('false');
          return;
        }
      }

      if (currentProblem.type === 'missing_operator') {
        if (e.key === '+') { e.preventDefault(); handleSubmitAnswer('+'); return; }
        if (e.key === '-' || e.key === '−') { e.preventDefault(); handleSubmitAnswer('−'); return; }
        if (e.key === '*' || e.key.toLowerCase() === 'x' || e.key === '×') { e.preventDefault(); handleSubmitAnswer('×'); return; }
        if (e.key === '/' || e.key === '÷') { e.preventDefault(); handleSubmitAnswer('÷'); return; }
      }

      // Режим Estimation: клавиши 1, 2, 3, 4
      if (currentProblem.type === 'estimation' && currentProblem.estimationRanges) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          e.preventDefault();
          const idx = parseInt(e.key, 10) - 1;
          const range = currentProblem.estimationRanges[idx];
          if (range) {
            sound.playClick();
            handleSubmitAnswer(range.label);
          }
          return;
        }
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        sound.playClick();
        setCurrentInput((prev) => (prev.length < 6 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        sound.playClick();
        setCurrentInput((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmitAnswer();
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isSkillMapOpen, isSessionFinished, feedbackState, currentProblem, currentInput]);

  const handleSelectLevel = (newLevel: DifficultyLevel) => {
    setLevel(newLevel);
    startNewSession(newLevel, trainingMode);
  };

  const handleSelectTrainingMode = (newMode: TrainingMode) => {
    setTrainingMode(newMode);
    startNewSession(level, newMode);
  };

  const handleToggleOperator = (op: Operator) => {
    let nextOps: Operator[];
    if (allowedOperators.includes(op)) {
      if (allowedOperators.length === 1) return;
      nextOps = allowedOperators.filter((o) => o !== op);
    } else {
      nextOps = [...allowedOperators, op];
    }
    setAllowedOperators(nextOps);
    setCurrentInput('');
    const newProblem = generateProblem({
      level,
      allowedOperators: nextOps,
      recentProblems,
    });
    setCurrentProblem(newProblem);
    startTimer();
  };

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    const updated = {
      ...storage,
      settings: { ...storage.settings, soundMuted: muted },
    };
    setStorage(updated);
    saveExtendedData(updated);
  };

  const handleToggleCleanMode = () => {
    const nextVal = !isCleanMode;
    setIsCleanMode(nextVal);
    const updated = {
      ...storage,
      settings: { ...storage.settings, cleanMode: nextVal },
    };
    setStorage(updated);
    saveExtendedData(updated);
    sound.playClick();
  };

  const handleToggleKeyboardMode = () => {
    const nextVal = !virtualKeypadOnly;
    setVirtualKeypadOnly(nextVal);
    const updated = {
      ...storage,
      settings: { ...storage.settings, virtualKeypadOnly: nextVal },
    };
    setStorage(updated);
    saveExtendedData(updated);
    sound.playClick();
  };

  const handleSubmitAnswer = (customAnswer?: string | number) => {
    if (feedbackState !== 'none' || isSessionFinished) return;

    let submittedAnswer: number | string;
    let isCorrect = false;

    if (customAnswer !== undefined) {
      submittedAnswer = customAnswer;
      if (currentProblem.type === 'true_false') {
        let actualMath: number;
        switch (currentProblem.operator) {
          case '+': actualMath = currentProblem.a + currentProblem.b; break;
          case '−': actualMath = currentProblem.a - currentProblem.b; break;
          case '×': actualMath = currentProblem.a * currentProblem.b; break;
          case '÷': actualMath = Math.round(currentProblem.a / currentProblem.b); break;
        }
        const trulyCorrect = currentProblem.proposedAnswer === actualMath;
        isCorrect = customAnswer === (trulyCorrect ? 'true' : 'false');
      } else if (currentProblem.type === 'missing_operator') {
        isCorrect = customAnswer === currentProblem.operator;
      } else if (currentProblem.type === 'estimation' && currentProblem.estimationRanges) {
        const correctRange = currentProblem.estimationRanges.find((r) => r.isCorrect);
        if (typeof customAnswer === 'number') {
          isCorrect = Boolean(currentProblem.estimationRanges[customAnswer]?.isCorrect);
          submittedAnswer = currentProblem.estimationRanges[customAnswer]?.label || String(customAnswer);
        } else {
          isCorrect = customAnswer === correctRange?.label;
          submittedAnswer = String(customAnswer);
        }
      }
    } else {
      if (currentInput.trim() === '') return;
      const num = Number(currentInput);
      submittedAnswer = num;
      if (currentProblem.type === 'missing_number') {
        const expected =
          currentProblem.missingSlot === 'a' ? currentProblem.a : currentProblem.b;
        isCorrect = num === expected;
      } else {
        isCorrect = num === currentProblem.answer;
      }
    }

    const timeSpentMs = performance.now() - problemStartTimeRef.current;
    const responseTimeSec = Number((timeSpentMs / 1000).toFixed(2));

    const newHistoryItem: SolvedItem = {
      problem: currentProblem,
      userAnswer: submittedAnswer,
      isCorrect,
      timeSpentMs,
    };

    const updatedHistory = [...history, newHistoryItem];
    setHistory(updatedHistory);

    const metric: TaskMetric = {
      id: `${Date.now()}-${problemIndex}`,
      operation: currentProblem.operation,
      operator: currentProblem.operator,
      a: currentProblem.a,
      b: currentProblem.b,
      correctAnswer: currentProblem.answer,
      userAnswer: submittedAnswer,
      correct: isCorrect,
      responseTime: responseTimeSec,
      difficulty: currentProblem.level,
      skillTags: currentProblem.tags,
      timestamp: Date.now(),
    };

    adaptiveEngine.registerProblemResult(metric, problemIndex, storage);
    const updatedMetrics = [...storage.metricsHistory.slice(-299), metric];
    const newStorage = { ...storage, metricsHistory: updatedMetrics };
    setStorage(newStorage);
    saveExtendedData(newStorage);

    let nextStreak = streak;
    if (isCorrect) {
      sound.playCorrect();
      setFeedbackState('correct');
      nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > sessionMaxStreak) {
        setSessionMaxStreak(nextStreak);
      }
    } else {
      sound.playWrong();
      setFeedbackState('wrong');
      setLastWrongAnswer(submittedAnswer);
      setStreak(0);
    }

    const delayMs = isCorrect ? 180 : 520;

    setTimeout(() => {
      if (problemIndex >= PROBLEMS_PER_SESSION) {
        stopTimer();
        setIsSessionFinished(true);
        sound.playComplete();

        const correctCount = updatedHistory.filter((h) => h.isCorrect).length;
        const totalTimeSec =
          updatedHistory.reduce((sum, h) => sum + h.timeSpentMs, 0) / 1000;
        const avgTimeSec = totalTimeSec / PROBLEMS_PER_SESSION;
        const finalMaxStreak = Math.max(sessionMaxStreak, nextStreak);
        const accuracy = Math.round((correctCount / PROBLEMS_PER_SESSION) * 100);

        const sessionRecord: TrainingSessionRecord = {
          id: `session-${Date.now()}`,
          timestamp: Date.now(),
          level,
          mode: trainingMode,
          total: PROBLEMS_PER_SESSION,
          correct: correctCount,
          accuracy,
          avgTimeSec,
          bestStreak: finalMaxStreak,
        };

        const finalStorage: ExtendedStorageData = {
          ...newStorage,
          trainingHistory: [...newStorage.trainingHistory.slice(-49), sessionRecord],
        };
        setStorage(finalStorage);
        saveExtendedData(finalStorage);
      } else {
        setProblemIndex((prev) => prev + 1);
        setCurrentInput('');
        setFeedbackState('none');
        setLastWrongAnswer(null);

        let nextProb: Problem;
        if (trainingMode === 'ladder' && ladderQueue.length > 0) {
          nextProb = ladderQueue[0];
          setLadderQueue(ladderQueue.slice(1));
        } else {
          nextProb = fetchNextProblem(
            level,
            problemIndex + 1,
            trainingMode,
            newStorage,
            [...recentProblems, currentProblem]
          );
        }

        setRecentProblems((prev) => [...prev.slice(-4), currentProblem]);
        setCurrentProblem(nextProb);
        startTimer();
      }
    }, delayMs);
  };

  const correctCount = history.filter((h) => h.isCorrect).length;
  const wrongCount = history.filter((h) => !h.isCorrect).length;
  const totalTimeSpentSec =
    history.reduce((sum, h) => sum + h.timeSpentMs, 0) / 1000;
  const averageTimeSec =
    history.length > 0 ? totalTimeSpentSec / history.length : 0;

  return (
    <div className="min-h-screen cosmic-bg stars-overlay text-white flex flex-col justify-between selection:bg-cyan-500/30 relative overflow-x-hidden">
      {/* 57 анимированных левитирующих частиц с глубиной и шейдерным фоном */}
      <CosmicParticles />

      {/* Шапка управления с эффектом стекла и неона */}
      <div className="relative z-10 w-full">
        <Header
          level={level}
          onSelectLevel={handleSelectLevel}
          allowedOperators={allowedOperators}
          onToggleOperator={handleToggleOperator}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          isCleanMode={isCleanMode}
          onToggleCleanMode={handleToggleCleanMode}
          onOpenSkillMap={() => setIsSkillMapOpen(true)}
          trainingMode={trainingMode}
          onSelectTrainingMode={handleSelectTrainingMode}
        />
      </div>

      {/* Основная сцена */}
      <main className="flex-1 flex flex-col justify-center items-center w-full px-2 relative z-10">
        {!isSessionFinished ? (
          <ProblemView
            problem={currentProblem}
            problemIndex={problemIndex}
            totalProblems={PROBLEMS_PER_SESSION}
            currentInput={currentInput}
            onInputChange={setCurrentInput}
            onSubmit={handleSubmitAnswer}
            feedbackState={feedbackState}
            lastWrongAnswer={lastWrongAnswer}
            elapsedSeconds={elapsedSeconds}
            streak={streak}
            isCleanMode={isCleanMode}
            virtualKeypadOnly={virtualKeypadOnly}
            onToggleKeyboardMode={handleToggleKeyboardMode}
            isAudioMode={trainingMode === 'audio'}
          />
        ) : (
          <ResultView
            level={level}
            totalProblems={PROBLEMS_PER_SESSION}
            correctCount={correctCount}
            wrongCount={wrongCount}
            averageTimeSec={averageTimeSec}
            bestStreak={sessionMaxStreak}
            history={history}
            isNewBestScore={lastBestInfo.isNewBestScore}
            isNewBestTime={lastBestInfo.isNewBestTime}
            onPlayAgain={() => startNewSession(level, trainingMode)}
            onNextLevel={
              level < 3
                ? () => {
                    const next = (level + 1) as DifficultyLevel;
                    setLevel(next);
                    startNewSession(next, trainingMode);
                  }
                : undefined
            }
            onOpenSkillMap={() => setIsSkillMapOpen(true)}
            onStartFocusPractice={(opName) => {
              let targetOp: Operator = '÷';
              if (opName.includes('Слож')) targetOp = '+';
              else if (opName.includes('Вычит')) targetOp = '−';
              else if (opName.includes('Умнож')) targetOp = '×';
              else if (opName.includes('Делен')) targetOp = '÷';

              setAllowedOperators([targetOp]);
              startNewSession(level, 'adaptive');
            }}
          />
        )}
      </main>

      {/* Нижняя панель точно как в обоих референсах */}
      <footer className="w-full max-w-sm sm:max-w-md mx-auto py-2.5 px-4 flex items-center justify-between text-[11px] font-sans text-zinc-500 border-t border-cyan-500/20 select-none shadow-[0_-1px_12px_rgba(6,182,212,0.15)] relative z-10">
        <div>
          <span>Enter — ввод</span>
          <span className="mx-1.5 font-bold text-zinc-600">·</span>
          <span>1–9 — цифры</span>
        </div>
        <div>
          <span>{PROBLEMS_PER_SESSION} задач в серии</span>
        </div>
      </footer>

      {/* Модальное окно Карты навыков */}
      <SkillMapView
        storage={storage}
        isOpen={isSkillMapOpen}
        onClose={() => setIsSkillMapOpen(false)}
        onSelectFocusPractice={(tagOrOp) => {
          let targetOp: Operator = '÷';
          if (tagOrOp.includes('Слож')) targetOp = '+';
          else if (tagOrOp.includes('Вычит')) targetOp = '−';
          else if (tagOrOp.includes('Умнож')) targetOp = '×';
          else if (tagOrOp.includes('Делен')) targetOp = '÷';
          setAllowedOperators([targetOp]);
          startNewSession(level, 'adaptive');
        }}
      />
    </div>
  );
}
