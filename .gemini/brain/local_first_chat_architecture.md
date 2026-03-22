# Local-First Chat Architecture Plan

To minimize fetching messages from the server every time a user opens a chat, we need to transition from a **cloud-first** approach (fetching from Supabase every time) to a **local-first** approach. 

This means storing the full message history locally on the user's device and only using the server to sync *new* messages or *changes* (like edits/deletions/reactions).

---

## 1. Storage Choice: IndexedDB (via Dexie.js)
Although `localStorage` exists, it is synchronous and strictly limited to ~5MB. For chat histories, we must use **IndexedDB**. 
- **IndexedDB** is built into all modern browsers (including iOS Safari and Android Chrome).
- It allows hundreds of MBs (or even GBs) of structured data storage asynchronously.
- **Library Recommendation**: [Dexie.js](https://dexie.org/). It is the standard wrapper for IndexedDB in React, providing a very simple, promise-based API and React hooks (`useLiveQuery`).

## 2. Requesting Persistent Storage
By default, browsers might clear IndexedDB data if the device runs extremely low on storage space. We can ask the browser for "persistent" storage to prevent this eviction.
```javascript
if (navigator.storage && navigator.storage.persist) {
  const isPersisted = await navigator.storage.persist();
  console.log(`Persistent storage granted: ${isPersisted}`);
}
```
*(Note: Browsers usually grant this automatically if the user has installed the app as a PWA or uses it frequently).*

## 3. Data Synchronization Flow (The Sync Engine)

To move to a local-first system, the flow inside the `useMessages` hook changes significantly:

### **Phase A: Instant Local Load**
When `ChatView` mounts:
1. Immediately query the local IndexedDB database for messages matching `conversation_id`.
2. Render these messages instantly on the screen (0 network latency).

### **Phase B: Background Sync (Catching Up)**
1. Get the `created_at` timestamp of the *newest local message* we have in IndexedDB for this conversation.
2. Send a query to Supabase: `SELECT * FROM messages WHERE conversation_id = X AND created_at > latest_local_timestamp`.
3. If new messages exist, insert them into IndexedDB.
4. (Optional but recommended) Sync modifications via an `updated_at` polling approach to catch edits, deletions, or new reactions that happened while offline.

### **Phase C: Real-Time Subscriptions**
1. Maintain the existing Supabase real-time WebSocket connection.
2. When a `INSERT` event comes in, add the message to IndexedDB.
3. When a `UPDATE` / `DELETE` event comes in, modify the message in IndexedDB.
4. Because the React components are bound to IndexedDB (e.g., via Dexie's `useLiveQuery`), the UI updates automatically whenever the local database changes.

## 4. Handling Media (Photos, Videos, Voice Notes)
Text messages are tiny, but media files consume real storage.
- **Strategy 1 (Caching URLs):** Save the Supabase storage URLs in IndexedDB, and rely on the browser's standard HTTP Cache or an offline Service Worker API to cache the actual image/video bytes.
- **Strategy 2 (Blob Storage):** Actually download the media as a `Blob` and save it directly into IndexedDB. This guarantees it works permanently offline, but requires careful storage management so the device doesn't fill up. Strategy 1 is usually safer and easier to start with.

## 5. Potential Challenges to Plan For

1. **Initial Full Dump:** Taking *all* messages from a massive historical conversation might be heavily taxing. We should still implement "Local Pagination" (e.g., loading 50 local messages at a time as the user scrolls up), even if they are stored locally.
2. **Schema Migrations:** If we ever change the shape of our message object, we need to handle migrating the local IndexedDB schema on the user's device using Dexie's migration features.
3. **Multi-device Sync:** If a user reads a message on their phone, the server marks it as read. When they open their laptop, the laptop's IndexedDB needs to pull that updated "read" status.

## 6. Implementation Steps

1. **Install Dexie:** `npm install dexie dexie-react-hooks`
2. **Define Schema:** Create a `db.ts` file declaring tables for `messages`, `conversations`, and `reactions`.
3. **Rewrite `useMessages` Hook:** Replace direct Supabase `select()` calls with Dexie local queries, accompanied by a background Supabase "delta fetch" to grab solely missing timestamps.
4. **Proxy Real-time:** Route Supabase WebSocket events to update the local database rather than React state directly.
