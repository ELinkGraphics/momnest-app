# Local-First Chat Implementation Plan

This plan details the exact, phase-by-phase execution to transition the cloud-first chat to a robust, production-ready **local-first** architecture capable of handling high scale safely.

## Phase 1: The Server-Side & Database Foundation
**Goal:** Prepare the Supabase schema to support monotonically increasing sequence cursors and a dedicated read receipts system for bulletproof delta syncing.
-   **Add Sequence Identifiers:** Create migrations to add a `seq` column (`BIGINT`) to the `messages` table.
-   **Conversation Sequence Tracking:** Add `current_seq` (`BIGINT`, default 0) to the `conversations` table.
-   **Database Triggers:** Create a trigger on `messages` that increments `conversations.current_seq` and assigns it to `messages.seq` on `INSERT` or `UPDATE` (if content changed).
-   **Read Receipts Table:** Create a new table `read_receipts` (`user_id`, `conversation_id`, `last_read_seq`, `updated_at`).
-   **Build Delta API/RPC:** Create a Supabase RPC or view to efficiently fetch messages for a conversation where `seq > last_seen_local_seq`.

## Phase 2: Client Storage & Security Initialize (Dexie)
**Goal:** Set up secure, persistent local storage on the client.
-   **Installation:** Run `npm install dexie dexie-react-hooks dexie-encrypted`.
-   **Schema Definition:** Create `src/lib/db.ts`. Define the schema for `messages`, `conversations`, `read_receipts`, and `sync_queue`.
-   **Encryption Middleware:** Implement `dexie-encrypted`. Use a key derivation function to turn the current user's session token into an AES key. 
-   **Auth Integration:** Ensure `db.open()` happens on login, and `db.delete()` or `db.close()` happens on logout to clear local data perfectly.
-   **Persistent Storage Request:** On web app initialization, call `navigator.storage.persist()` to ask the OS not to evict the DB.

## Phase 3: The Core Sync Engine & UI Binding
**Goal:** Replace the cloud calls with local queries and background synchronization.
-   **Rewrite `useMessages` Output:** Instead of reading state from a Supabase query context, change `useMessages` to return data using `useLiveQuery(() => db.messages.where({ conversation_id: id }).toArray())`.
-   **Implement Delta Sync Function:** Create a background function `syncConversation(id)` that:
    1. Checks the `last_seen_seq` in the local `conversations` table.
    2. Calls the Supabase Delta RPC.
    3. Writes the new messages into Dexie using Last-Write-Wins (LWW) resolution based on `updated_at`.
-   **Proxy WebSockets to Dexie:** Update the existing Supabase real-time channel. When an `INSERT` or `UPDATE` event arrives, write the payload directly to Dexie. (The UI will react automatically via `useLiveQuery`).

## Phase 4: Optimistic UI & Robust Sending
**Goal:** Provide instant UX when sending messages, backed by a persistent queue for failures.
-   **Update Local Schema:** Ensure local messages have an `id` (temporary UUIDv4) and a `sync_status` (`'pending' | 'synced' | 'failed'`).
-   **Optimistic Send Mutation:** Update the UI send function to:
    1. Write a `pending` message instantly into Dexie.
    2. Attempt to `POST` to Supabase.
    3. If successful, update the Dexie record resolving the temporary `id` with the real server UUID and `seq`, marking it `synced`.
-   **Queueing Background Failures:** If the `POST` fails (e.g., offline), leave the status as `pending`. 
-   **UI Indicators:** Render messages lightly faded with a clock icon if their `sync_status` is `pending`, or a red exclamation mark with a retry button if `failed`.

## Phase 5: Storage Rules & Service Worker
**Goal:** Handle massive histories and prevent storage crashes over time.
-   **Eviction Policy Script:** Implement an initialization script that queries `navigator.storage.estimate()`. If usage exceeds 80%, delete messages order than 90 days from Dexie where `sync_status === 'synced'`.
-   **Background Sync API:** Register a Service Worker `sync` event. When the OS detects the network is restored, the Service Worker wakes up, reads the `pending` queue from Dexie, and flushes them to Supabase, guaranteeing delivery even if the app tab was closed dynamically.
-   **Historical Scrolling:** If the user scrolls past what's in IndexedDB (e.g., beyond the 90-day evicted window), trigger an older paginated fetch to Supabase to append those legacy messages *dynamically* to the UI (without necessarily storing them back permanently).
