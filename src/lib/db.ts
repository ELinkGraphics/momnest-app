import { Dexie, type Table } from 'dexie';
import { applyEncryptionMiddleware, NON_INDEXED_FIELDS, clearAllTables } from 'dexie-encrypted';

export interface LocalMessage {
  id: string; 
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  seq?: number;
  sync_status: 'synced' | 'pending' | 'failed';
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
}

export class ChatDatabase extends Dexie {
  messages!: Table<LocalMessage, string>;
  conversations!: Table<LocalConversation, string>;
  read_receipts!: Table<LocalReadReceipt, [string, string]>;
  sync_queue!: Table<SyncQueueItem, string>;

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

      // Apply dexie-encrypted middleware
      // @ts-ignore - TS types for dexie-encrypted might clash with Dexie v4 Table types
      applyEncryptionMiddleware(
        this, 
        encryptionKey, 
        {
          messages: NON_INDEXED_FIELDS,
          conversations: NON_INDEXED_FIELDS,
          read_receipts: NON_INDEXED_FIELDS,
        },
        async (db) => {
          console.warn('[Dexie] Encryption key changed or invalid, clearing local tables to prevent crash.');
          await clearAllTables(db);
        }
      );
      
      console.log('Chat local database encryption initialized.');
    } catch (err) {
      console.error('Failed to initialize local DB encryption', err);
    }
  }
}

// Export a singleton instance
export const chatDb = new ChatDatabase();
