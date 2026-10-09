import {
  getPendingSyncQueueItems,
  removeSyncQueueItems,
  updateSyncQueueItemStatus,
  markItemsAsSynced,
} from './indexedDb';
import { TrainingSession, SessionAnswer, SyncQueueItem } from './types';
import { getSupabaseClient, getAuthenticatedUser } from './supabaseClient';

export const MAX_ANSWERS_PER_BATCH = 25;

export interface SyncBatchResult {
  status: 'success' | 'failed' | 'skipped' | 'idle';
  reason?: string;
  syncedSessionsCount?: number;
  syncedAnswersCount?: number;
  error?: string;
}

export class SyncService {
  private isSyncing = false;
  private isOnlineListenerAttached = false;

  constructor() {
    this.initOnlineListener();
  }

  private initOnlineListener() {
    if (typeof window !== 'undefined' && !this.isOnlineListenerAttached) {
      window.addEventListener('online', () => {
        this.triggerSync();
      });
      this.isOnlineListenerAttached = true;
    }
  }

  /**
   * Неблокирующий запуск фоновой синхронизации
   */
  public triggerSync(): void {
    if (typeof window === 'undefined') return;
    this.syncBatch().catch((err) => {
      console.warn('Background sync warning:', err);
    });
  }

  /**
   * Синхронизация пачки телеметрии с Supabase RPC
   */
  public async syncBatch(): Promise<SyncBatchResult> {
    if (this.isSyncing) {
      return { status: 'skipped', reason: 'already_syncing' };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { status: 'skipped', reason: 'supabase_not_configured' };
    }

    // Проверка авторизации пользователя (не отправляем данные, если пользователь не авторизован)
    const user = await getAuthenticatedUser();
    if (!user) {
      return { status: 'skipped', reason: 'user_not_authenticated' };
    }

    this.isSyncing = true;

    try {
      // 1. Извлекаем очередь из IndexedDB
      const pendingItems = await getPendingSyncQueueItems(100);
      if (pendingItems.length === 0) {
        return { status: 'idle' };
      }

      // 2. Разделяем сессии и ответы
      const sessionItems: SyncQueueItem[] = [];
      const answerItems: SyncQueueItem[] = [];

      for (const item of pendingItems) {
        if (item.entityType === 'session') {
          sessionItems.push(item);
        } else if (item.entityType === 'answer') {
          answerItems.push(item);
        }
      }

      // Ограничиваем пакет максимум 25 ответами за один запрос
      const selectedAnswerItems = answerItems.slice(0, MAX_ANSWERS_PER_BATCH);
      const selectedAnswerIds = new Set(selectedAnswerItems.map((i) => (i.payload as SessionAnswer).id));

      // Сессии: включаем сессии из очереди (или те, к которым относятся выбранные ответы)
      const selectedSessionItems = sessionItems.slice(0, 10);
      const selectedSessionsMap = new Map<string, TrainingSession>();

      for (const sItem of selectedSessionItems) {
        const s = sItem.payload as TrainingSession;
        selectedSessionsMap.set(s.id, s);
      }

      const sessionsPayload: TrainingSession[] = Array.from(selectedSessionsMap.values());
      const answersPayload: SessionAnswer[] = selectedAnswerItems
        .map((item) => item.payload as SessionAnswer)
        .sort((a, b) => a.problemIndex - b.problemIndex);

      if (sessionsPayload.length === 0 && answersPayload.length === 0) {
        return { status: 'idle' };
      }

      // 3. Формируем контракт пакета
      const payload = {
        sessions: sessionsPayload,
        answers: answersPayload,
      };

      // 4. Отправляем в RPC `sync_telemetry_batch`
      const { data, error } = await client.rpc('sync_telemetry_batch', {
        p_payload: payload,
      });

      if (error) {
        // Ошибка сети или отклонение RPC сервером: сохраняем элементы в очереди для повтора
        const errorMsg = error.message || 'Unknown RPC error';
        console.warn('Sync batch failed, items preserved for retry:', errorMsg);

        for (const item of [...selectedSessionItems, ...selectedAnswerItems]) {
          await updateSyncQueueItemStatus(item.id, item.attempts + 1, errorMsg);
        }

        return {
          status: 'failed',
          error: errorMsg,
        };
      }

      if (data && data.status === 'ok') {
        // 5. Сервер подтвердил успешный приём: удаляем элементы из очереди и отмечаем как synced
        const syncedSessionIds = (data.synced_sessions as string[]) || sessionsPayload.map((s) => s.id);
        const syncedAnswerIds = (data.synced_answers as string[]) || answersPayload.map((a) => a.id);

        const queueItemIdsToDelete: string[] = [];
        for (const sItem of selectedSessionItems) {
          queueItemIdsToDelete.push(sItem.id);
        }
        for (const aItem of selectedAnswerItems) {
          queueItemIdsToDelete.push(aItem.id);
        }

        await markItemsAsSynced(syncedSessionIds, syncedAnswerIds);
        await removeSyncQueueItems(queueItemIdsToDelete);

        return {
          status: 'success',
          syncedSessionsCount: syncedSessionIds.length,
          syncedAnswersCount: syncedAnswerIds.length,
        };
      }

      return {
        status: 'failed',
        error: 'Unexpected server response structure',
      };
    } catch (err: any) {
      console.warn('Network or storage error during sync:', err);
      return {
        status: 'failed',
        error: err?.message || 'Unexpected sync error',
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
