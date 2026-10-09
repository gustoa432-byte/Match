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
import { StartView } from './components/StartView';
import { ProblemView } from './components/ProblemView';
import { ResultView, SolvedItem } from './components/ResultView';
import { ModeSelectModal } from './components/ModeSelectModal';
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

  // Состояние жизненного цикла игры
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'finished'>('idle');

  // Настройки
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getMuted());
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

  // Модальные окна
  const [isSkillMapOpen, setIsSkillMapOpen] = useState<boolean>(false);
  const [isModeModalOpen, setIsModeModalOpen] = useState<boolean>(false);
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

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const handleStartGame = useCallback(() => {
    sound.playStart();
    startNewSession(level, trainingMode);
    setGameState('playing');
  }, [level, trainingMode, startNewSession]);

  const handleRestart = useCallback(() => {
    sound.playRestart();
    startNewSession(level, trainingMode);
    setGameState('playing');
  }, [level, trainingMode, startNewSession]);

  // Глобальный ввод с физической клавиатуры
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (isSkillMapOpen) {
        if (e.key === 'Escape') setIsSkillMapOpen(false);
        return;
      }

      if (isModeModalOpen) {
        if (e.key === 'Escape') setIsModeModalOpen(false);
        return;
      }

      if (gameState === 'idle') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (gameState === 'finished') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRestart();
        }
        return;
      }

      // Если в режиме игры
      if (feedbackState !== 'none') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleRestart();
        return;
      }

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
  }, [
    isSkillMapOpen,
    isModeModalOpen,
    gameState,
    feedbackState,
    currentProblem,
    currentInput,
    handleStartGame,
    handleRestart,
  ]);

  const handleSelectLevel = (newLevel: DifficultyLevel) => {
    setLevel(newLevel);
    if (gameState === 'playing') {
      startNewSession(newLevel, trainingMode);
    }
  };

  const handleSelectTrainingMode = (newMode: TrainingMode) => {
    setTrainingMode(newMode);
    if (gameState === 'playing') {
      startNewSession(level, newMode);
    }
  };

  const handleToggleOperator = (op: Operator) => {
    let next: Operator[];
    if (allowedOperators.includes(op)) {
      if (allowedOperators.length === 1) return; // минимум 1 операция
      next = allowedOperators.filter((o) => o !== op);
    } else {
      next = [...allowedOperators, op];
    }
    setAllowedOperators(next);
    if (gameState === 'playing') {
      startNewSession(level, trainingMode);
    }
  };

  const handleToggleMute = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
    const updated = {
      ...storage,
      settings: { ...storage.settings, soundMuted: next },
    };
    setStorage(updated);
    saveExtendedData(updated);
  };

  const handleToggleKeyboardMode = () => {
    setVirtualKeypadOnly((prev) => {
      const next = !prev;
      const updated = {
        ...storage,
        settings: { ...storage.settings, virtualKeypadOnly: next },
      };
      setStorage(updated);
      saveExtendedData(updated);
      return next;
    });
  };

  const handleSubmitAnswer = (customAnswer?: string | number) => {
    if (gameState !== 'playing') return;
    if (feedbackState !== 'none') return;

    let parsedUserAnswer: number | string | null = null;
    let isCorrect = false;

    if (currentProblem.type === 'true_false') {
      const ansStr = customAnswer !== undefined ? String(customAnswer) : currentInput.trim();
      if (!ansStr) return;
      const isEquationTrue = currentProblem.proposedAnswer === currentProblem.answer;
      isCorrect = (ansStr === 'true' && isEquationTrue) || (ansStr === 'false' && !isEquationTrue);
      parsedUserAnswer = ansStr === 'true' ? 'Верно' : 'Неверно';
    } else if (currentProblem.type === 'missing_operator') {
      const ansStr = customAnswer !== undefined ? String(customAnswer) : currentInput.trim();
      if (!ansStr) return;
      isCorrect = ansStr === currentProblem.operator;
      parsedUserAnswer = ansStr;
    } else if (currentProblem.type === 'estimation') {
      const ansStr = customAnswer !== undefined ? String(customAnswer) : currentInput.trim();
      if (!ansStr) return;
      const correctRange = currentProblem.estimationRanges?.find((r) => r.isCorrect);
      isCorrect = ansStr === correctRange?.label;
      parsedUserAnswer = ansStr;
    } else {
      const rawInput = customAnswer !== undefined ? String(customAnswer) : currentInput.trim();
      if (rawInput === '') return;
      const num = parseInt(rawInput, 10);
      if (isNaN(num)) return;
      parsedUserAnswer = num;
      isCorrect = num === currentProblem.answer;
    }

    const responseTimeSec = Math.max(0.2, (performance.now() - problemStartTimeRef.current) / 1000);

    const metric: TaskMetric = {
      id: `metric-${Date.now()}-${problemIndex}`,
      operation: currentProblem.operation,
      operator: currentProblem.operator,
      a: currentProblem.a,
      b: currentProblem.b,
      correctAnswer: currentProblem.answer,
      userAnswer: parsedUserAnswer,
      correct: isCorrect,
      responseTime: parseFloat(responseTimeSec.toFixed(2)),
      difficulty: level,
      skillTags: currentProblem.tags,
      timestamp: Date.now(),
    };

    const newStorage: ExtendedStorageData = {
      ...storage,
      metricsHistory: [...storage.metricsHistory.slice(-299), metric],
    };
    adaptiveEngine.registerProblemResult(metric, problemIndex, newStorage);
    setStorage(newStorage);
    saveExtendedData(newStorage);

    const item: SolvedItem = {
      problem: currentProblem,
      userAnswer: parsedUserAnswer,
      isCorrect,
      timeSpentMs: Math.round(responseTimeSec * 1000),
    };
    const updatedHistory = [...history, item];
    setHistory(updatedHistory);

    let nextStreak = streak;
    if (isCorrect) {
      nextStreak = streak + 1;
      setStreak(nextStreak);
      setSessionMaxStreak((prev) => Math.max(prev, nextStreak));
      setFeedbackState('correct');
      sound.playCorrect();
    } else {
      setStreak(0);
      setFeedbackState('wrong');
      setLastWrongAnswer(parsedUserAnswer);
      sound.playWrong();
    }

    const delayMs = isCorrect ? 350 : 850;

    window.setTimeout(() => {
      if (problemIndex >= PROBLEMS_PER_SESSION) {
        stopTimer();
        setIsSessionFinished(true);
        setGameState('finished');
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

  const allSessions = storage.trainingHistory || [];
  const overallBestStreak = allSessions.reduce((max, s) => Math.max(max, s.bestStreak || 0), 0);
  const totalSessionsCount = allSessions.length;

  return (
    <div className="h-full h-[100dvh] max-h-[100dvh] cosmic-bg stars-overlay text-white flex flex-col justify-between selection:bg-cyan-500/30 relative overflow-hidden select-none">
      {/* 57 анимированных левитирующих частиц с глубиной и шейдерным фоном */}
      <CosmicParticles />

      {/* Шапка управления с эффектом стекла и неона - z-30 для гарантии чистого наложения */}
      <div className="relative z-30 w-full shrink-0">
        <Header
          level={level}
          onSelectLevel={handleSelectLevel}
          allowedOperators={allowedOperators}
          onToggleOperator={handleToggleOperator}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenSkillMap={() => setIsSkillMapOpen(true)}
          trainingMode={trainingMode}
          onOpenModeSelect={() => setIsModeModalOpen(true)}
        />
      </div>

      {/* Основная сцена */}
      <main className="flex-1 min-h-0 flex flex-col justify-center items-center w-full px-2 relative z-10 overflow-hidden">
        {gameState === 'idle' ? (
          <StartView
            level={level}
            allowedOperators={allowedOperators}
            trainingMode={trainingMode}
            onStart={handleStartGame}
            onOpenModeSelect={() => setIsModeModalOpen(true)}
            onOpenSkillMap={() => setIsSkillMapOpen(true)}
            totalSessions={totalSessionsCount}
            bestStreak={overallBestStreak}
          />
        ) : gameState === 'playing' ? (
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
            onPlayAgain={handleRestart}
            onNextLevel={
              level < 3
                ? () => {
                    const next = (level + 1) as DifficultyLevel;
                    setLevel(next);
                    startNewSession(next, trainingMode);
                    setGameState('playing');
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
              setGameState('playing');
            }}
          />
        )}
      </main>

      {/* Нижняя панель */}
      <footer className="w-full max-w-sm sm:max-w-md mx-auto py-1.5 sm:py-2 px-3 sm:px-4 flex items-center justify-between text-[10px] sm:text-[11px] font-sans text-zinc-500 border-t border-cyan-500/20 select-none shadow-[0_-1px_12px_rgba(6,182,212,0.15)] relative z-10 shrink-0">
        <div>
          {gameState === 'idle' ? (
            <span>Enter или Пробел — старт</span>
          ) : (
            <>
              <span>Enter — ввод</span>
              <span className="mx-1.5 font-bold text-zinc-600">·</span>
              <span>1–9 — цифры</span>
            </>
          )}
        </div>
        <div>
          <span>{PROBLEMS_PER_SESSION} задач в серии</span>
        </div>
      </footer>

      {/* Модальное окно выбора режима - z-[100] над всеми слоями */}
      <ModeSelectModal
        isOpen={isModeModalOpen}
        currentMode={trainingMode}
        onSelectMode={(newMode) => {
          handleSelectTrainingMode(newMode);
        }}
        onClose={() => setIsModeModalOpen(false)}
      />

      {/* Модальное окно Карты навыков - z-[100] над всеми слоями */}
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
          setGameState('playing');
        }}
      />
    </div>
  );
}
