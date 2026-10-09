import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

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
 * Проверка или получение авторизованного пользователя (включая анонимного)
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) return user;

    // Попытка анонимного входа, если пользователь не авторизован
    const { data: anonData, error: anonError } = await client.auth.signInAnonymously();
    if (anonError) {
      console.warn('Anonymous sign-in not available or failed:', anonError.message);
      return null;
    }
    return anonData.user;
  } catch (err) {
    console.warn('Error during Supabase authentication check:', err);
    return null;
  }
}

/**
 * Сброс инстанса (для тестов)
 */
export function resetSupabaseInstanceForTesting(): void {
  supabaseInstance = null;
}
