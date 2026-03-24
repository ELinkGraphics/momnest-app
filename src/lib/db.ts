import { Dexie, type Table } from 'dexie';
import { applyEncryptionMiddleware, NON_INDEXED_FIELDS, clearAllTables } from 'dexie-encrypted';

export interface LocalMessage {
  id: string; 
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  attachment_url: string;
  reply_to_id: string;
  created_at: string;
  updated_at: string;
  seq?: number;
  sync_status: 'synced' | 'pending' | 'failed';
}

/** Call this before any Dexie write to guarantee no null leaks into encrypted fields */
export function sanitizeMessage(msg: Partial<LocalMessage>): LocalMessage {
  const ensureString = (val: any, fallback: string = ''): string => {
    if (typeof val === 'string') return val;
    if (val === null || val === undefined) return fallback;
    return String(val);
  };

  return {
    id:             msg.id!,
    conversation_id: msg.conversation_id!,
    sender_id:      ensureString(msg.sender_id),
    content:        ensureString(msg.content),
    message_type:   ensureString(msg.message_type, 'text'),
    attachment_url: ensureString(msg.attachment_url),
    reply_to_id:    ensureString(msg.reply_to_id),
    created_at:     msg.created_at!,
    updated_at:     msg.updated_at!,
    seq:            msg.seq,
    sync_status:    msg.sync_status ?? 'pending',
  } as LocalMessage;
}

export interface LocalConversation {
  id: string;
  last_seen_seq: number;
}

export interface LocalReadReceipt {
  user_id: string;
  conversation_id: string;
  last_read_seq: number;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'message_insert' | 'message_update' | 'message_delete' | 'read_receipt';
  payload: any;
  created_at: string;
  retry_count: number;
  status?: 'pending' | 'processing' | 'failed';
}

export class ChatDatabase extends Dexie {
  messages!: Table<LocalMessage, string>;
  conversations!: Table<LocalConversation, string>;
  read_receipts!: Table<LocalReadReceipt, [string, string]>;
  sync_queue!: Table<SyncQueueItem, string>;

  private resolveEncryptionKey!: (key: Uint8Array) => void;

  constructor() {
    super('MomNestChatDB');
    
    // Schema version 1
    // The keys listed here are the indexed fields. Everything else is unindexed payload.
    // @ts-ignore - TS sometimes fails to resolve the Dexie base class methods properly
    this.version(1).stores({
      messages: 'id, conversation_id, [conversation_id+created_at], sync_status',
      conversations: 'id',
      read_receipts: '[user_id+conversation_id], conversation_id',
      sync_queue: 'id, type'
    });

    // Schema version 2: add created_at as an index for eviction queries
    this.version(2).stores({
      messages: 'id, conversation_id, created_at, [conversation_id+created_at], sync_status'
    });

    // Defer the encryption key so Dexie blocks queries until we provide it from UserContext
    const keyPromise = new Promise<Uint8Array>((resolve) => {
      this.resolveEncryptionKey = resolve;
    });

    // Apply dexie-encrypted middleware BEFORE the DB officially opens
    try {
      // @ts-ignore - TS types for dexie-encrypted might clash with Dexie 4.0 Table types
      (applyEncryptionMiddleware as any)(
        this, 
        keyPromise, 
        {
          messages: {
            type: 'encrypt',
            fields: ['content', 'attachment_url', 'sender_id', 'message_type', 'reply_to_id'],
          },
        } as any,
        async (db) => {
          console.warn('[Dexie] Encryption key changed or invalid, clearing local tables to prevent crash.');
          await clearAllTables(db);
        }
      );
    } catch (e) {
      console.error('Dexie encryption middleware setup failed', e);
    }
  }

  // Initialize DB with encryption key derived from session
  async initEncryption(sessionToken: string) {
    if (!sessionToken) return;

    // Request persistent storage if available
    try {
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`Persistent storage granted: ${isPersisted}`);
      }
    } catch (e) {
      console.error('Failed to request persistent storage', e);
    }

    try {
      // Derive a 32-byte key from the session token using Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(sessionToken);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const encryptionKey = new Uint8Array(hashBuffer);

      // Release the promise, allowing Dexie to process deferred queries
      this.resolveEncryptionKey(encryptionKey);
      
      console.log('Chat local database encryption initialized with deferred key.');

      // Self-Healing Clear: Wipe corrupted legacy data if version mismatch
      const ENCRYPTION_VERSION = 'v2_zeronull';
      const storedVersion = localStorage.getItem('MOMNEST_DB_ENCRYPTION_VERSION');
      if (storedVersion !== ENCRYPTION_VERSION) {
        console.warn(`[Dexie] Encryption version mismatch (${storedVersion} -> ${ENCRYPTION_VERSION}). Clearing tables...`);
        await clearAllTables(this);
        localStorage.setItem('MOMNEST_DB_ENCRYPTION_VERSION', ENCRYPTION_VERSION);
        console.log('[Dexie] Local tables cleared for new encryption schema.');
      }
    } catch (err) {
      console.error('Failed to initialize local DB encryption key', err);
    }
  }
}

// Export a singleton instance
export const chatDb = new ChatDatabase();
