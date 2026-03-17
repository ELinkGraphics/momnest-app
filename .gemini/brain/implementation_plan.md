# Bug Fix: Story Upload Error & Post UI Restoration

## Problem Description
1. **Story Upload Error**: A minified React error #310 ("Rendered more hooks than during the previous render") occurs when attempting to upload a story. This likely stems from a conditional hook or an early return in `CustomFilePicker.tsx` or its usage in `StoryEditor.tsx`.
2. **Post UI Regression**: The post creation UI has been replaced by a generic "Add File" button. The user wants to restore the original UI (with edit functionality) and only use `CustomFilePicker` when clicking the photo or video buttons.

## Proposed Changes

### 1. Fix React Error #310
- **[MODIFY] [CreateStoryModal.tsx](file:///c:/Users/elink/./heart-lens-studio-main/src/components/CreateStoryModal.tsx)**
  - Move `if (!isOpen) return null;` to after all hook calls (useState, useEffect, useFileManager) to satisfy the Rules of Hooks.
- **[MODIFY] [CustomFilePicker.tsx](file:///c:/Users/elink/./heart-lens-studio-main/src/components/CustomFilePicker.tsx)**
  - Fix the broken Capacitor back button listener logic (ensure `listenerHandle` is correctly typed and cleaned up).
  - Clean up `any` types that remain.

### 2. Restore Post Creation UI
- **[MODIFY] [CreatePost.tsx](file:///c:/Users/elink/./heart-lens-studio-main/src/pages/CreatePost.tsx)**
  - Restore "Photo" and "Video" buttons in the "Additional Options" section.
  - Wrap these buttons with `CustomFilePicker` to trigger the selection UI.
  - Re-implement a custom preview list that includes an "Edit" button (using `ImageCropper`) if the user wants to crop a photo before posting.
  - Ensure `selectedMedia` and `fileManager` are harmonized.

## Verification Plan
### Manual Verification
1. **Story Upload**: Open the story editor, add a sticker/image, and verify it uploads without the React error.
2. **Post Creation**: Open the post creation modal. Verify it looks as it did before (multi-step or specific buttons). Click "Photo/Video" and verify the `CustomFilePicker` opens. Verify editing (if applicable) still works.
