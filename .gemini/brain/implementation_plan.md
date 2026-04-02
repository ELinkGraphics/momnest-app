# 🎬 Story Feature: Deep Analysis & Instagram-Level Redesign

Complete bug audit, performance analysis, and UI/UX redesign plan for the Story system.

---

## A. 🐞 Bug Report

### 🔴 HIGH Severity

#### BUG-1: Progress timer creates infinite `goToNext` calls
**File:** [StoryViewer.tsx](file:///c:/Users/elink/./src/components/StoryViewer.tsx#L417-L431)

The `setInterval` callback calls `setProgress`, and when `prev >= 100`, it calls `goToNext()` **inline inside the state updater**. But `goToNext` itself calls `setProgress(0)` and `setCurrentIndex(...)`, which causes multiple re-renders. This creates a race condition where:
1. `prev >= 100` triggers `goToNext()`
2. `goToNext()` sets `progress = 0` and updates `currentIndex`
3. The interval is cleared and re-created (because `goToNext` is in the deps)
4. But during the re-render gap, the old interval may fire again before cleanup, calling `goToNext()` **twice**

This causes **story skipping** — users occasionally see a story get skipped entirely.

#### BUG-2: `STORY_DURATION` uses stale `videoDuration` on story change
**File:** [StoryViewer.tsx](file:///c:/Users/elink/./src/components/StoryViewer.tsx#L65)

`videoDuration` is not reset when transitioning to a new story. When going from a 30s video to a 5s image, `STORY_DURATION` can still be `30000` because `videoDuration` hasn't been cleared yet, causing the image to display for 30 seconds.

**Fix:** Reset `videoDuration` to `null` in `goToNext()` and `goToPrevious()`.

#### BUG-3: `viewedStoryIds` ref is never cleared between viewer sessions
**File:** [StoryViewer.tsx](file:///c:/Users/elink/./src/components/StoryViewer.tsx#L51)

`viewedStoryIds` is a `useRef<Set>` that persists across open/close cycles. After closing and re-opening the viewer, previously viewed stories won't trigger `onStoryViewed` again. 

**Fix:** Clear the set when `isOpen` changes to `false`.

#### BUG-4: `fetchStories` debounces with `useMemo` but creates closure leak
**File:** [StoryContext.tsx](file:///c:/Users/elink/./src/contexts/StoryContext.tsx#L22-L159)

The `fetchStories` function is created inside `useMemo` and captures a `timer` variable. However, when `user` changes, the old timer is NOT cleared.

**Fix:** Use `useRef` for the debounce timer and clear it in a cleanup effect.

#### BUG-5: Nested `setTimeout` in transitions creates race conditions
**File:** [StoryViewer.tsx](file:///c:/Users/elink/./src/components/StoryViewer.tsx#L342-L352)

These timeouts are never cleaned up on unmount. If the viewer is closed during a transition, these fire on an unmounted component.

---

### 🟡 MEDIUM Severity

#### BUG-13: `stickerData` override in `StoryContext.tsx`
**File:** [StoryContext.tsx](file:///c:/Users/elink/./src/contexts/StoryContext.tsx#L93)

The transformed sticker data from mentions **replaces** any actual sticker_data from the database. Link stickers become non-clickable.

#### BUG-6: `StoryContext` fetches ALL story_mentions without a filter
**File:** [StoryContext.tsx](file:///c:/Users/elink/./src/contexts/StoryContext.tsx#L58-L64)

Fetches every mention ever created without an `in('story_id', activeStoryIds)` filter.

#### BUG-8: Swipe and pointer events conflict
**File:** [StoryViewer.tsx](file:///c:/Users/elink/./src/components/StoryViewer.tsx#L405-L408)

`useSwipeGestures` and pointer events fire simultaneously on touch devices, causing double-navigation.

---

## B. 🎨 UI Redesign Plan

- **Blur Background**: Added dynamic blurred background mirroring story media.
- **rAF Progress**: 60fps buttery-smooth progress bars.
- **Unified Gestures**: Pointer-based hold/tap/swipe-down system.
- **Gradient Overlays**: Top/bottom readability improvements.

## C. 🧪 Verification Results
- ✅ **Type Check**: Project compiles with 0 TypeScript errors.
- ✅ **Logic Flow**: Verified state transitions and pause/resume logic.
- ✅ **Performance**: Optimized fetching and rendering logic.
