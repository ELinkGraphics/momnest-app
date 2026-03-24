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
  sync_status: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export interface LocalConversationMeta {
  conversation_id: string;
  other_user_id: string | null;
  other_user_name: string;
  other_user_username: string | null;
  other_user_avatar: string | null;
  other_user_initials: string;
  other_user_online: boolean;
  last_message: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
  is_group: boolean;
  group_name: string | null;
  group_avatar_url: string | null;
  member_count: number;
}

export interface LocalReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
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

export interface LocalPinnedConversation {
  conversation_id: string;
  user_id: string;
  pinned_at: string;
}

export interface LocalSyncQueueItem {
  id: string;
  type: 'message_insert' | 'message_update' | 'message_delete' | 'read_receipt';
  payload: any;
  created_at: string;
  retry_count: number;
  status?: 'pending' | 'processing' | 'failed';
}

export class ChatDatabase extends Dexie {
  messages!: Table<LocalMessage, string>;
  message_reactions!: Table<LocalReaction, string>;
  conversations!: Table<{ id: string; last_seen_seq: number }, string>;
  conversations_meta!: Table<LocalConversationMeta, string>;
  read_receipts!: Table<LocalReadReceipt, number>; // Changed to LocalReadReceipt and number for ++id
  sync_queue!: Table<LocalSyncQueueItem, string>;
  pinned_conversations!: Table<LocalPinnedConversation, string>;

  private resolveEncryptionKey!: (key: Uint8Array) => void;

  constructor() {
    super('MomNestChatDB');
    
    // Schema version 1
    // The keys listed here are the indexed fields. Everything else is unindexed payload.
    // @ts-ignore - TS sometimes fails to resolve the Dexie base class methods properly
    this.version(1).stores({
      messages: 'id, conversation_id, [conversation_id+created_at], sync_status',
      conversations: 'id',
      conversations_meta: 'conversation_id',
      read_receipts: '++id, [conversation_id+user_id], conversation_id',
      sync_queue: 'id, type, created_at',
      message_reactions: 'id, message_id, [message_id+user_id+emoji]'
    });

    // Schema version 2: add created_at as an index for eviction queries
    this.version(2).stores({
      messages: 'id, conversation_id, created_at, [conversation_id+created_at], sync_status'
    });

    // Schema version 3: sync_status expansion and reaction naming cleanup
    this.version(3).stores({
      message_reactions: 'id, message_id, [message_id+user_id+emoji]'
    });

    // Schema version 4: add pinned_conversations table
    this.version(4).stores({
      pinned_conversations: 'conversation_id'
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

      // Self-Healing Clear: Wipe corrupted legacy data if version mismatch
      const ENCRYPTION_VERSION = 'v3_pinned_fix';
      const storedVersion = localStorage.getItem('MOMNEST_DB_ENCRYPTION_VERSION');
      if (storedVersion !== ENCRYPTION_VERSION) {
        console.warn(`[Dexie] Encryption version mismatch (${storedVersion} -> ${ENCRYPTION_VERSION}). Clearing tables BEFORE unblocking queries...`);
        await clearAllTables(this);
        localStorage.setItem('MOMNEST_DB_ENCRYPTION_VERSION', ENCRYPTION_VERSION);
        console.log('[Dexie] Local tables cleared for new encryption schema.');
      }

      // Release the promise, allowing Dexie to process deferred queries ONLY after version check
      this.resolveEncryptionKey(encryptionKey);
      
      console.log('Chat local database encryption initialized and unblocked.');
    } catch (err) {
      console.error('Failed to initialize local DB encryption key', err);
    }
  }
}

// Export a singleton instance
export const chatDb = new ChatDatabase();
