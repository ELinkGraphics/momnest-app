# Implementation Plan - PWA Back Navigation & Chat Scroll Fix

This plan ensures that the Android hardware/gesture back button provides a consistent and expected user experience, following the navigation hierarchy and implementation requirements provided.

## User Review Required

> [!IMPORTANT]
> I will be refactoring the `/messages` route to use sub-routes (e.g., `/messages/:conversationId`). This might affect existing links to the chat view if they rely on state rather than URL.

## Proposed Changes

### [Core Navigation Framework](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/contexts/NavigationContext.tsx)

#### [NEW] [NavigationContext.tsx](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/contexts/NavigationContext.tsx)
- Create a context to manage "back-press consumers" (modals, sheets, overlays).
- Implement a global `popstate` listener.
- Provide a `pushModalState(closeFn: () => void)` helper that:
    1. Pushes a dummy state to history: `window.history.pushState({ isModal: true }, '')`.
    2. Registers the `closeFn`.
- In `popstate`, if we were in a modal state, call the registered `closeFn` and prevent further navigation.

### [Routing Updates](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/App.tsx)

#### [MODIFY] [App.tsx](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/App.tsx)
- Update `/messages` to support `:conversationId`.
- Add placeholders for `/thread/:messageId` and `/media/:mediaId` if needed, or integrate them into sub-components.

### [Messages & Chat Refactor](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/pages/Messages.tsx)

#### [MODIFY] [Messages.tsx](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/pages/Messages.tsx)
- Use `useParams()` to get `conversationId`.
- Remove internal `selectedConversationId` state where it conflicts with URL.
- Implement scroll position saving in `window.history.replaceState` before navigating forward.

#### [MODIFY] [ChatView.tsx](file:///c:/Users/elink/./gemini/antigravity/scratch/MomNest/heart-lens-studio-main/src/components/messages/ChatView.tsx)
- Implement scroll restoration logic in `useEffect`.
- **Fix**: Update the messages-triggered `useEffect` to only call `scrollToBottom` if:
    1. The user is already near the bottom (within ~100px).
    2. OR the last message in the list is from the current user (sent by them).

### [Modal & Sheet Integration]

#### [MODIFY] [Various Modals]
- Update `CreateGroupModal`, `SOSCreationModal`, and `CustomFilePicker` to use the `NavigationContext`'s `pushModalState`.

## Verification Plan

### Manual Verification (on Android/Emulator or via Desktop Back Button)
- [ ] **Home -> Chat -> Back**: Should return to Home.
- [ ] **Chat -> Modal -> Back**: Should close Modal, stay in Chat.
- [ ] **Chat -> Scroll -> Open Profile -> Back**: Should return to Chat at the same scroll position.
- [ ] **Home -> Back**: App should minimize (not show blank/exit unexpectedly).
- [ ] **Chat -> Fullscreen Media -> Back**: Should close media, stay in Chat.
