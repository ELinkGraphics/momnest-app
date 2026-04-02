# Story Feature Redesign - Task Tracker

## Phase 1: Critical Bug Fixes
- [x] BUG-13: Fix sticker_data override in StoryContext (link stickers broken)
- [x] BUG-1: Fix progress timer race condition (story skipping) → rAF-based
- [x] BUG-2: Fix stale videoDuration on story change → reset in goToNext/goToPrevious
- [x] BUG-3: Clear viewedStoryIds when viewer closes
- [x] BUG-4: Fix fetchStories debounce closure leak → useRef timer
- [x] BUG-5: Fix uncleared transition timeouts → tracked + cleanup
- [x] BUG-6: Filter story_mentions query by active story IDs
- [x] BUG-8: Fix swipe/pointer event conflict → unified pointer system
- [x] BUG-9: Fix unconditional pause resume → pauseReasons tracking
- [x] BUG-10: Use unique placeholder ID instead of -1

## Phase 2: Performance
- [x] PERF-2: Parallelize StoryContext queries (views + mentions)
- [x] PERF-2b: Parallelize useStoryActivity queries (views + likes + messages)
- [x] PERF-3: Debounce useStoryActivity re-fetches (300ms)

## Phase 3: UI Redesign (Instagram-level)
- [x] Blur background implementation (CSS filter blur + scale + dark overlay)
- [x] rAF-based smooth progress bar (60fps)
- [x] Pause reason tracking system
- [x] Swipe-down-to-close gesture (with opacity/scale feedback)
- [x] Enhanced progress bar styling (glow dot)
- [x] Hold-to-pause visual feedback
- [x] Gradient overlays (top + bottom) for readability
- [x] Glassmorphism UI elements (buttons, input, menus)
- [x] Time-ago display in header (replaces story count)
- [x] Animated story background fade-in
- [x] Smooth media transitions (slide with scale)
- [x] Desktop: rounded frame with shadow

## Phase 4: Architecture
- [x] Unified gesture handler (pointer-based: tap/hold/swipe-horizontal/swipe-down)
- [x] Clean up StoryViewer state management (pauseReasons, ref-based goToNext)
