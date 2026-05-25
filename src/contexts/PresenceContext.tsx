import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { formatDistanceToNow } from 'date-fns';

interface PresenceState {
  [userId: string]: Array<{
    user_id: string;
    online_at: string;
  }>;
}

interface PresenceContextType {
  onlineUsers: Set<string>;
  isUserOnline: (userId: string) => boolean;
  getLastSeen: (userId: string) => string | null;
  getLastSeenText: (userId: string) => string | null;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider: React.FC<{ userId: string | undefined; children: ReactNode }> = ({ userId, children }) => {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  // Track last seen timestamps for users who go offline
  const [lastSeenMap, setLastSeenMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!userId) {
      setOnlineUsers(new Set());
      return;
    }

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as PresenceState;
        const users = new Set<string>();
        
        Object.keys(state).forEach((key) => {
          if (state[key] && state[key].length > 0) {
            users.add(key);
          }
        });
        
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUsers(prev => new Set([...prev, key]));
        // Remove from lastSeen since they're now online
        setLastSeenMap(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
        // Record the time they went offline
        setLastSeenMap(prev => {
          const next = new Map(prev);
          next.set(key, new Date().toISOString());
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const isUserOnline = useCallback((checkUserId: string) => onlineUsers.has(checkUserId), [onlineUsers]);

  /**
   * Get the ISO timestamp of when a user was last seen online.
   * Returns null if we haven't observed them going offline in this session.
   */
  const getLastSeen = useCallback((checkUserId: string): string | null => {
    return lastSeenMap.get(checkUserId) || null;
  }, [lastSeenMap]);

  /**
   * Get a human-readable "last seen X ago" text.
   * Returns "Online" if they're currently online, 
   * "last seen X ago" if we have data, or null otherwise.
   */
  const getLastSeenText = useCallback((checkUserId: string): string | null => {
    if (onlineUsers.has(checkUserId)) return 'Online';
    const lastSeen = lastSeenMap.get(checkUserId);
    if (lastSeen) {
      return `last seen ${formatDistanceToNow(new Date(lastSeen), { addSuffix: false })} ago`;
    }
    return null;
  }, [onlineUsers, lastSeenMap]);

  return (
    <PresenceContext.Provider value={{ onlineUsers, isUserOnline, getLastSeen, getLastSeenText }}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresenceContext = () => {
  const context = useContext(PresenceContext);
  if (context === undefined) {
    throw new Error('usePresenceContext must be used within a PresenceProvider');
  }
  return context;
};
