/**
 * Аудио-движок и тактильная отдача (Haptic Feedback) премиум-уровня в стиле Apple (iOS Taptic Engine)
 */

class AppleAudioHaptics {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private clickBuffer: AudioBuffer | null = null;
  private isWarmedUp: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem('mental_math_sound_muted');
      if (saved !== null) {
        this.isMuted = saved === 'true';
      }
    } catch {
      // Игнорируем ошибку чтения localStorage
    }

    // Слушатели первого жеста для мгновенного прогрева AudioContext до первого нажатия
    if (typeof window !== 'undefined') {
      const warmUpHandler = () => {
        this.warmUp();
        window.removeEventListener('pointerdown', warmUpHandler);
        window.removeEventListener('keydown', warmUpHandler);
        window.removeEventListener('touchstart', warmUpHandler);
      };
      window.addEventListener('pointerdown', warmUpHandler, { passive: true });
      window.addEventListener('keydown', warmUpHandler, { passive: true });
      window.addEventListener('touchstart', warmUpHandler, { passive: true });
    }
  }

  public warmUp(): void {
    if (this.isWarmedUp) return;
    try {
      this.initCtx();
      this.getClickBuffer();
      this.isWarmedUp = true;
    } catch {
      // Игнорируем
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Кэшированный буфер щелчка клавиши (предсоздается один раз, чтобы не нагружать CPU/GC в момент тапа)
   */
  private getClickBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (this.clickBuffer) return this.clickBuffer;

    try {
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * 0.008)); // 8ms
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Генерируем естественный акустический импульс с экспоненциальным затуханием один раз
      for (let i = 0; i < bufferSize; i++) {
        const decay = Math.exp(-i / (bufferSize * 0.25));
        data[i] = (Math.random() * 2 - 1) * decay;
      }
      this.clickBuffer = buffer;
      return buffer;
    } catch {
      return null;
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem('mental_math_sound_muted', String(muted));
    } catch {
      // Игнорируем
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Тактильная вибрация (Haptic feedback)
   */
  public vibrate(pattern: number | number[] = 10): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Игнорируем на неподдерживаемых устройствах
    }
  }

  /**
   * Премиальный щелчок клавиши в стиле iOS (Apple Taptic Keyboard Click)
   * Выполняется асинхронно в микротаске, чтобы ни на 1 мс не блокировать синхронный UI-отклик
   */
  public playClick(): void {
    queueMicrotask(() => {
      this.vibrate(8); // Легкий тактильный тик (light haptic)
      if (this.isMuted) return;

      try {
        this.initCtx();
        if (!this.ctx) return;

        const buffer = this.getClickBuffer();
        if (!buffer) return;

        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Полосовой фильтр с частотой 2400Гц для приятного матового щелчка как в iOS
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, now);
        filter.Q.setValueAtTime(3.2, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
        noise.stop(now + 0.015);
      } catch {
        // Игнорируем
      }
    });
  }

  /**
   * Премиальный звук верного ответа в стиле Apple Pay / AirDrop Chime
   * Чистый гармонический двухтоновый хрустальный колокольчик (Eb5 -> Bb5)
   */
  public playCorrect(): void {
    this.vibrate([12, 40, 15]); // Приятный двойной тактильный импульс (success haptic)
    if (this.isMuted) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Первый тон (Eb5 = 622.25 Hz)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(622.25, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Второй тон (Bb5 = 932.33 Hz) с небольшой задержкой
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(932.33, now + 0.06);
      gain2.gain.setValueAtTime(0.09, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.35);
    } catch {
      // Игнорируем
    }
  }

  /**
   * Премиальный глухой тактильный звук ошибки (Apple Haptic Thud)
   * Глухой низкочастотный импульс с резонансом
   */
  public playWrong(): void {
    this.vibrate([25, 30, 35]); // Тревожный тройной тактильный отклик (warning haptic)
    if (this.isMuted) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.16);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Игнорируем
    }
  }

  /**
   * Финальный торжественный хрустальный аккорд (Apple Achievement Chord)
   */
  public playComplete(): void {
    this.vibrate([15, 60, 20, 60, 35]); // Праздничный каскадный тактильный паттерн
    if (this.isMuted) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Чистый мажорный септаккорд (C6, E6, G6, B6)
      const notes = [1046.5, 1318.5, 1567.98, 1975.5];

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.06, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.5);
      });
    } catch {
      // Игнорируем
    }
  }

  /**
   * Восходящее арпеджио старта игры
   */
  public playStart(): void {
    this.vibrate([15, 30, 20]);
    if (this.isMuted) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.08, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.22);
      });
    } catch {
      // Игнорируем
    }
  }

  /**
   * Звук быстрого рестарта
   */
  public playRestart(): void {
    this.vibrate(15);
    if (this.isMuted) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [440, 554.37].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.07, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.18);
      });
    } catch {
      // Игнорируем
    }
  }
}

export const sound = new AppleAudioHaptics();
