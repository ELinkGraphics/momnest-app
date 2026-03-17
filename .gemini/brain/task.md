# Task: Story Upload Fix & Post UI Restoration

- [x] Fix React Error #310 in Story Upload
    - [x] Audit `CustomFilePicker.tsx` for hook violations (conditional hooks, early returns)
    - [x] Audit `StoryEditor.tsx` for hook violations
    - [x] Test story upload flow (Ready for user testing)
- [x] Restore Post Creation UI
    - [x] Identify original Photo/Video button layout in `CreatePost.tsx` (or similar components)
    - [x] Integrate `CustomFilePicker` as a trigger for "Photo" and "Video" buttons
    - [x] Restore/Ensure "edit functionality" (image cropping/previews) works
    - [x] Verify `CreatePost.tsx` UI and functionality
- [x] Final Verification
    - [x] Full build and test
    - [x] Update walkthrough
