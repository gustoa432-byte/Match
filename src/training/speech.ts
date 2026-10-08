/**
 * Модуль синтеза речи для режима Audio Mode (голосовая озвучка примеров)
 */
export function speakProblemRussian(a: number, operator: string, b: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    window.speechSynthesis.cancel(); // Очистить предыдущее воспроизведение

    let opPhrase = '';
    switch (operator) {
      case '+':
        opPhrase = 'плюс';
        break;
      case '−':
      case '-':
        opPhrase = 'минус';
        break;
      case '×':
      case '*':
        opPhrase = 'умножить на';
        break;
      case '÷':
      case '/':
        opPhrase = 'разделить на';
        break;
      default:
        opPhrase = operator;
    }

    const text = `${a} ${opPhrase} ${b}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.05; // чуть быстрее для динамики
    utterance.pitch = 1.0;

    // Пытаемся найти русскоязычный голос
    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find((v) => v.lang.startsWith('ru'));
    if (ruVoice) {
      utterance.voice = ruVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Игнорируем сбои аудио-синтезатора
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Игнорируем
    }
  }
}
