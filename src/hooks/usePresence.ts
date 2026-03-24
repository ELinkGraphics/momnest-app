import { usePresenceContext } from '@/contexts/PresenceContext';

export const usePresence = (userId: string | undefined) => {
  const { onlineUsers, isUserOnline } = usePresenceContext();
  
  // Backward compatibility: maintain the same API structure
  return { 
    onlineUsers, 
    isUserOnline,
    // Note: The channel is now managed by PresenceProvider, but we return null
    // here to ensure any existing destructuring in components doesn't break.
    channel: null 
  };
};
