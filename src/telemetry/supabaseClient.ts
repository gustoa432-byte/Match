import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function canUseNetwork(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (navigator.onLine === false) return false;
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Network operation timed out')), ms)
    ),
  ]);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url === 'https://your-project.supabase.co') {
    return null;
  }

  try {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
}

/**
 * Проверка или получение авторизованного пользователя (включая анонимного) с жестким таймаутом и оффлайн-гардом
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  if (!canUseNetwork()) {
    return null;
  }

  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { user } } = await withTimeout(client.auth.getUser(), 4000);
    if (user) return user;

    // Попытка анонимного входа, если пользователь не авторизован
    const { data: anonData, error: anonError } = await withTimeout(client.auth.signInAnonymously(), 4000);
    if (anonError || !anonData?.user) {
      return null;
    }
    return anonData.user;
  } catch (err) {
    // Ошибка сети или тайм-аут -> возвращаем null, не бросаем исключение
    return null;
  }
}

/**
 * Сброс инстанса (для тестов)
 */
export function resetSupabaseInstanceForTesting(): void {
  supabaseInstance = null;
}
