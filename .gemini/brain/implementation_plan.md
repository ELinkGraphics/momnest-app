# Real-time Circle Video Player Integration

Transition the Circle Video Player from mock data to real-time data from Supabase, ensuring all interactions (likes, comments, shares) are live and correctly attributed to the circle.

## User Review Required

> [!IMPORTANT]
> This update involves creating new database tables for `circle_video_likes` and `circle_video_comments` as the generic `video_likes` table is linked specifically to the main `videos` feed.

## Proposed Changes

### [Database] [Interactions Schema](file:///c:/Users/elink/./heart-lens-studio-main/supabase/migrations/20260319110000_circle_video_interactions.sql) [NEW]
- **Tables**: Create `circle_video_likes`, `circle_video_comments`, and `circle_video_stats`.
- **Policies**: Set up Row Level Security (RLS) for public read and authenticated write.
- **Atomic Increments**: Add SQL functions for count updates.

### [Hooks] [useCircleVideoInteractions](file:///c:/Users/elink/./heart-lens-studio-main/src/hooks/useCircleVideoInteractions.ts) [NEW]
- **Functional Hooks**: `useVideoLikes`, `useVideoComments`, and `useVideoStats`.
- **Mutations**: `toggleLike`, `addComment`, and `incrementShare`.
- **Real-time**: Integration with `supabase.channel` for live listener updates.

### [Component] [CircleVideoPlayer](file:///c:/Users/elink/./heart-lens-studio-main/src/components/circles/CircleVideoPlayer.tsx) [MODIFY]
- **Dynamic Header**: Display `circle.name` and member count.
- **Styled Icons**: Update Back and Close button colors to `var(--primary)` and strip background overlays.
- **Interactions Layer**:
    - Bind Like/Comment/Share buttons to the new hooks.
    - Remove all hardcoded mock comments.
- **Layout Adjustments**:
    - Ensure full-screen modal fit.
    - Implement collapsible "Read more" for video descriptions.
    - Implement "View all" toggle for comments.

## Verification Plan

### Automated Tests
- Build verification (`npm run build`).
- Verify Supabase real-time payloads in the Network tab.

### Manual Verification
- **Cross-session testing**: Verify that clicking "Like" in one browser instance updates the count and state in another instance instantly.
- **Pagination**: Verify that "View all comments" loads the full list correctly.
- **UI Consistency**: Ensure Back/Close buttons match the app's primary theme.
