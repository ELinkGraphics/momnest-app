import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Pin, PinOff, MessageCircle, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Conversation } from '@/hooks/useConversations';
import { Skeleton } from '@/components/ui/skeleton';
import { usePresence } from '@/hooks/usePresence';

interface ConversationsListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  isLoading: boolean;
  currentUserId: string;
}

const UnreadBadge = ({ count }: { count: number }) => {
  const [animate, setAnimate] = useState(false);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      setAnimate(true);
      const t = setTimeout(() => setAnimate(false), 600);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  return (
    <span
      className={`bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center shrink-0 transition-transform ${animate ? 'animate-bounce-in' : ''
        }`}
    >
      {count}
    </span>
  );
};

interface ContextPopup {
  conversation: Conversation;
  isPinned: boolean;
}

const ConversationsList: React.FC<ConversationsListProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  isLoading,
  currentUserId,
}) => {
  const { isUserOnline } = usePresence(currentUserId);

  // --- Pin state (persisted in localStorage) ---
  const storageKey = `pinnedConversations_${currentUserId}`;
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [contextPopup, setContextPopup] = useState<ContextPopup | null>(null);

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
    setContextPopup(null);
  }, [storageKey]);

  // --- Long-press handling ---
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, conversation: Conversation) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setContextPopup({ conversation, isPinned: pinnedIds.has(conversation.conversation_id) });
    }, 500);
  };

  const endLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Sort: pinned first, then by last message time
  const sortedConversations = [...conversations].sort((a, b) => {
    const aPinned = pinnedIds.has(a.conversation_id) ? 1 : 0;
    const bPinned = pinnedIds.has(b.conversation_id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4 border-b border-border/50">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6 animate-fade-in">
        <MessageCircle className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-base font-semibold text-foreground mb-2">No conversations yet</h3>
        <p className="text-sm text-muted-foreground">
          Start a conversation by messaging someone from their profile
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {sortedConversations.map((conversation) => {
        const isSelected = conversation.conversation_id === selectedConversationId;
        const isLastMessageFromOther = conversation.last_message_sender_id !== currentUserId;
        const isUnread = conversation.unread_count > 0 && isLastMessageFromOther;
        const isPinned = pinnedIds.has(conversation.conversation_id);

        return (
          <button
            key={conversation.conversation_id}
            onClick={() => {
              if (!longPressTriggered.current) {
                onSelectConversation(conversation.conversation_id);
              }
            }}
            onMouseDown={(e) => startLongPress(e, conversation)}
            onMouseUp={endLongPress}
            onMouseLeave={endLongPress}
            onTouchStart={(e) => startLongPress(e, conversation)}
            onTouchEnd={endLongPress}
            onTouchCancel={endLongPress}
            className={`w-full flex items-center gap-3 p-4 border-b border-border/50 active:bg-muted/70 transition-colors text-left ${isSelected ? 'bg-muted' : 'hover:bg-muted/30'
              } ${isPinned ? 'bg-primary/5' : ''}`}
          >
            <div className="relative">
              <Avatar className="h-14 w-14">
                {conversation.is_group ? (
                  <>
                    <AvatarImage src={conversation.group_avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-accent to-primary text-white text-sm">
                      <Users className="h-6 w-6" />
                    </AvatarFallback>
                  </>
                ) : (
                  <>
                    <AvatarImage src={conversation.other_user_avatar || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm">
                      {conversation.other_user_initials}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              {!conversation.is_group && isUserOnline(conversation.other_user_id || '') && (
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-success border-2 border-background" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isPinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <h3 className={`font-semibold truncate text-base ${isUnread ? 'text-foreground' : 'text-foreground/80'}`}>
                    {conversation.is_group ? conversation.group_name : conversation.other_user_name}
                  </h3>
                  {conversation.is_group && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      · {conversation.member_count}
                    </span>
                  )}
                </div>
                {conversation.last_message_at && (
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm truncate flex-1 ${isUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {conversation.last_message || 'No messages yet'}
                </p>
                {isUnread && (
                  <UnreadBadge count={conversation.unread_count} />
                )}
              </div>
            </div>
          </button>
        );
      })}

      {/* Long-Press Context Popup */}
      {contextPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setContextPopup(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Popup Card */}
          <div
            className="relative z-10 bg-background/90 backdrop-blur-2xl border border-border/50 rounded-[28px] shadow-2xl w-[300px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Contact Header */}
            <div className="flex items-center gap-3 p-5 border-b border-border/30">
              <Avatar className="h-12 w-12">
                {contextPopup.conversation.is_group ? (
                  <>
                    <AvatarImage src={contextPopup.conversation.group_avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-accent to-primary text-white text-sm">
                      <Users className="h-5 w-5" />
                    </AvatarFallback>
                  </>
                ) : (
                  <>
                    <AvatarImage src={contextPopup.conversation.other_user_avatar || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm">
                      {contextPopup.conversation.other_user_initials}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate">
                  {contextPopup.conversation.is_group
                    ? contextPopup.conversation.group_name
                    : contextPopup.conversation.other_user_name}
                </p>
                {contextPopup.conversation.last_message && (
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {contextPopup.conversation.last_message}
                  </p>
                )}
              </div>
              <button
                onClick={() => setContextPopup(null)}
                className="p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="p-2">
              <button
                onClick={() => togglePin(contextPopup.conversation.conversation_id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors text-left"
              >
                {contextPopup.isPinned ? (
                  <>
                    <PinOff className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">Unpin from top</span>
                  </>
                ) : (
                  <>
                    <Pin className="h-5 w-5 text-primary" />
                    <span className="font-medium">Pin to top</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setContextPopup(null);
                  onSelectConversation(contextPopup.conversation.conversation_id);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors text-left"
              >
                <MessageCircle className="h-5 w-5 text-primary" />
                <span className="font-medium">Open Chat</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationsList;
