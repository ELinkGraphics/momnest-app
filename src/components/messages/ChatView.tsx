import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Send, ArrowLeft, Loader2, Plus, X, Pencil, Reply, Pin, Check, CheckCheck, Users, Search, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { useMessages, useSendMessage, useOtherUserLastRead } from '@/hooks/useMessages';
import { useMessageReactions, useEditMessage, useDeleteMessage, useForwardMessage, usePinnedMessage } from '@/hooks/useMessageActions';
import { useConversations, Conversation } from '@/hooks/useConversations';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { usePresence } from '@/hooks/usePresence';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import TelegramAttachmentSheet from './TelegramAttachmentSheet';
import MediaPreviewModal from './MediaPreviewModal';
import ChatMediaGalleryModal from './ChatMediaGalleryModal';
import VoiceRecorder from './VoiceRecorder';
import MessageBubble from './MessageBubble';
import MessageActionMenu from './MessageActionMenu';
import ReactionBar from './ReactionBar';
import DeleteMessageDialog from './DeleteMessageDialog';
import ForwardMessageModal from './ForwardMessageModal';
import MediaGroupMosaic, { MediaItem } from './MediaGroupMosaic';
import MediaLightbox from './MediaLightbox';
import CircleInvitationModal from '@/components/circles/CircleInvitationModal';
import GroupInfoModal from './GroupInfoModal';
import PollMessageBubble from './PollMessageBubble';

interface ChatViewProps {
  conversation: Conversation;
  currentUserId: string;
  currentUserAvatar?: string | null;
  currentUserInitials: string;
  currentUserName: string;
  onBack: () => void;
}

interface ActiveMessage {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  messageType: string;
  attachmentUrl?: string;
}

const ChatView: React.FC<ChatViewProps> = ({
  conversation,
  currentUserId,
  currentUserAvatar,
  currentUserInitials,
  currentUserName,
  onBack
}) => {
  const navigate = useNavigate();
  const [messageText, setMessageText] = useState('');
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ files: File[]; type: 'photo' | 'video' } | null>(null);
  const [invitationModalId, setInvitationModalId] = useState<string | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);


  const { messages, isLoading } = useMessages(conversation.conversation_id, currentUserId);
  const otherUserLastRead = useOtherUserLastRead(conversation.conversation_id, currentUserId);
  const { sendMessage, isSending } = useSendMessage();
  const { reactions, toggleReaction } = useMessageReactions(conversation.conversation_id);
  const editMessage = useEditMessage();
  const { deleteForMe, deleteForEveryone } = useDeleteMessage();
  const forwardMessage = useForwardMessage();
  const { conversations } = useConversations(currentUserId);
  const { isUserOnline } = usePresence(currentUserId);
  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(
    conversation.conversation_id,
    currentUserId,
    currentUserName
  );

  // Interaction state
  const [actionMenu, setActionMenu] = useState<{ isOpen: boolean; position: { x: number; y: number }; message: ActiveMessage | null }>({
    isOpen: false, position: { x: 0, y: 0 }, message: null,
  });
  const [reactionBar, setReactionBar] = useState<{ isOpen: boolean; position: { x: number; y: number }; messageId: string }>({
    isOpen: false, position: { x: 0, y: 0 }, messageId: '',
  });
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; message: ActiveMessage | null }>({
    isOpen: false, message: null,
  });
  const [forwardModal, setForwardModal] = useState<{ isOpen: boolean; message: ActiveMessage | null }>({
    isOpen: false, message: null,
  });
  const [replyTo, setReplyTo] = useState<ActiveMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ActiveMessage | null>(null);
  const { pinnedMessage, pinMessage, unpinMessage } = usePinnedMessage(conversation.conversation_id, messages);
  const [lightbox, setLightbox] = useState<{ items: MediaItem[]; index: number } | null>(null);

  // Long press handling
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleProfileClick = () => {
    if (conversation.is_group) {
      setGroupInfoOpen(true);
    } else {
      setMediaGalleryOpen(true);
    }
  };

  const handleNavigateToProfile = () => {
    if (conversation.other_user_id) {
      navigate(`/profile/${conversation.other_user_id}`);
    }
  };


  const scrollToBottom = (instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  // Scroll instantly to bottom when conversation first loads
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (messages.length > 0) {
      if (initialLoadRef.current) {
        // First load: scroll instantly to bottom
        setTimeout(() => scrollToBottom(true), 50);
        initialLoadRef.current = false;
      } else {
        // New messages: scroll smoothly
        scrollToBottom(false);
      }
    }
  }, [messages]);

  // Reset initial load flag when conversation changes
  useEffect(() => {
    initialLoadRef.current = true;
  }, [conversation.conversation_id]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [messageText]);

  // Focus input when replying or editing
  useEffect(() => {
    if (replyTo || editingMessage) {
      textareaRef.current?.focus();
    }
  }, [replyTo, editingMessage]);

  const getSenderName = (senderId: string) => {
    return senderId === currentUserId ? currentUserName : conversation.other_user_name;
  };

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent, msg: any) => {
    longPressTriggered.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setActionMenu({
        isOpen: true,
        position: { x: clientX, y: clientY },
        message: {
          id: msg.id,
          content: msg.content,
          senderId: msg.sender_id,
          senderName: getSenderName(msg.sender_id),
          messageType: (msg as any).message_type || 'text',
          attachmentUrl: (msg as any).attachment_url,
        },
      });
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleSendMessage = () => {
    if (!messageText.trim() || isSending) return;
    stopTyping();

    if (editingMessage) {
      editMessage.mutate({
        messageId: editingMessage.id,
        content: messageText.trim(),
        conversationId: conversation.conversation_id,
      });
      setEditingMessage(null);
      setMessageText('');
      return;
    }

    const insertData: any = {
      conversationId: conversation.conversation_id,
      senderId: currentUserId,
      content: messageText.trim(),
    };

    if (replyTo) {
      insertData.replyToId = replyTo.id;
    }

    sendMessage(insertData);
    setMessageText('');
    setReplyTo(null);
  };

  const handleSendAttachment = (type: string, url: string, label: string) => {
    sendMessage({
      conversationId: conversation.conversation_id,
      senderId: currentUserId,
      content: label,
      messageType: type,
      attachmentUrl: url,
    });
  };

  const handleMediaSelected = (files: File[], type: 'photo' | 'video') => {
    setMediaPreview({ files, type });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Enter creates new line (default behavior), no override needed
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (e.target.value.trim()) startTyping();
    else stopTyping();
  };

  // Action handlers
  const handleReply = () => {
    if (actionMenu.message) {
      setReplyTo(actionMenu.message);
      setEditingMessage(null);
    }
  };

  const handleCopy = () => {
    if (actionMenu.message) {
      navigator.clipboard.writeText(actionMenu.message.content);
      toast.success('Copied to clipboard');
    }
  };

  const handleEdit = () => {
    if (actionMenu.message) {
      setEditingMessage(actionMenu.message);
      setMessageText(actionMenu.message.content);
      setReplyTo(null);
    }
  };

  const handleDelete = () => {
    if (actionMenu.message) {
      setDeleteDialog({ isOpen: true, message: actionMenu.message });
    }
  };

  const handleForward = () => {
    if (actionMenu.message) {
      setForwardModal({ isOpen: true, message: actionMenu.message });
    }
  };

  const handleReact = () => {
    if (actionMenu.message) {
      setReactionBar({
        isOpen: true,
        position: actionMenu.position,
        messageId: actionMenu.message.id,
      });
    }
  };

  const handlePin = () => {
    if (actionMenu.message) {
      if (pinnedMessage?.id === actionMenu.message.id) {
        unpinMessage();
      } else {
        pinMessage(actionMenu.message.id);
      }
    }
  };

  const scrollToMessage = (messageId: string) => {
    const el = messageRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-primary/10');
      setTimeout(() => el.classList.remove('bg-primary/10'), 1500);
    }
  };

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim() || !isSearchOpen) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }
    const query = searchQuery.toLowerCase();
    const results = messages
      .filter((m: any) => m.content?.toLowerCase().includes(query))
      .map((m: any) => m.id);
    
    setSearchResults(results);
    if (results.length > 0) {
      setCurrentSearchIndex(results.length - 1); // Start at the newest match
    } else {
      setCurrentSearchIndex(-1);
    }
  }, [searchQuery, messages, isSearchOpen]);

  useEffect(() => {
    if (currentSearchIndex >= 0 && searchResults[currentSearchIndex]) {
       scrollToMessage(searchResults[currentSearchIndex]);
    }
  }, [currentSearchIndex, searchResults]);

  const handleSearchNext = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
  };

  const handleSearchPrev = () => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
  };

  // Get reactions for a message
  const getMessageReactions = (messageId: string) => {
    return reactions.filter((r: any) => r.message_id === messageId);
  };

  // Find reply-to message content
  const getReplyMessage = (replyToId: string | null) => {
    if (!replyToId) return null;
    const msg = messages.find(m => m.id === replyToId);
    if (!msg) return null;
    const msgType = (msg as any).message_type || 'text';
    let displayContent = msg.content;
    if (msgType === 'photo') displayContent = msg.content || '📷 Photo';
    else if (msgType === 'video') displayContent = msg.content || '🎥 Video';
    else if (msgType === 'voice') displayContent = '🎤 Voice message';
    else if (msgType === 'location') displayContent = '📍 Location';
    return {
      senderName: getSenderName(msg.sender_id),
      content: displayContent,
      id: msg.id,
    };
  };

  // Swipe-to-reply handling
  const swipeState = useRef<{ startX: number; messageData: any } | null>(null);

  const handleSwipeStart = (e: React.TouchEvent, msg: any) => {
    swipeState.current = { startX: e.touches[0].clientX, messageData: msg };
  };

  const handleSwipeEnd = (e: React.TouchEvent) => {
    if (!swipeState.current) return;
    const dx = e.changedTouches[0].clientX - swipeState.current.startX;
    if (dx > 80) {
      const msg = swipeState.current.messageData;
      setReplyTo({
        id: msg.id,
        content: msg.content,
        senderId: msg.sender_id,
        senderName: getSenderName(msg.sender_id),
        messageType: (msg as any).message_type || 'text',
        attachmentUrl: (msg as any).attachment_url,
      });
    }
    swipeState.current = null;
  };

  // Filter out deleted messages
  const visibleMessages = messages.filter((msg: any) => !msg.deleted_for_everyone);

  // Group consecutive media messages from same sender
  type MessageGroup = { type: 'single'; message: any } | { type: 'media_group'; messages: any[]; senderId: string };
  const groupedMessages: MessageGroup[] = [];

  for (let i = 0; i < visibleMessages.length; i++) {
    const msg = visibleMessages[i];
    const msgType = (msg as any).message_type || 'text';
    const isMedia = (msgType === 'photo' || msgType === 'video') && (msg as any).attachment_url;

    if (isMedia) {
      // Look ahead for consecutive media from same sender
      const mediaGroup = [msg];
      let j = i + 1;
      while (j < visibleMessages.length) {
        const nextMsg = visibleMessages[j];
        const nextType = (nextMsg as any).message_type || 'text';
        const nextIsMedia = (nextType === 'photo' || nextType === 'video') && (nextMsg as any).attachment_url;
        if (nextIsMedia && nextMsg.sender_id === msg.sender_id) {
          // Check if sent within 60 seconds of previous
          const timeDiff = Math.abs(new Date(nextMsg.created_at).getTime() - new Date(mediaGroup[mediaGroup.length - 1].created_at).getTime());
          if (timeDiff < 60000) {
            mediaGroup.push(nextMsg);
            j++;
          } else break;
        } else break;
      }

      if (mediaGroup.length > 1) {
        groupedMessages.push({ type: 'media_group', messages: mediaGroup, senderId: msg.sender_id });
        i = j - 1; // Skip grouped messages
      } else {
        groupedMessages.push({ type: 'single', message: msg });
      }
    } else {
      groupedMessages.push({ type: 'single', message: msg });
    }
  }

  const hasText = messageText.trim().length > 0;

  return (
    <div className="flex flex-col h-screen lg:h-full bg-background">
      {/* Header */}
      <div className="flex-none sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border">
        {!isSearchOpen ? (
          <div className="flex items-center gap-3 px-3 py-3 safe-top">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="lg:hidden -ml-2 h-10 w-10 active:scale-95 transition-transform"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div
              className="relative cursor-pointer active:scale-95 transition-transform"
              onClick={handleProfileClick}
            >
              <Avatar className="h-11 w-11">
                <AvatarImage src={conversation.is_group ? (conversation.group_avatar_url || undefined) : (conversation.other_user_avatar || undefined)} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm">
                  {conversation.is_group ? (
                    <Users className="h-5 w-5" />
                  ) : (
                    conversation.other_user_initials
                  )}
                </AvatarFallback>
              </Avatar>
              {!conversation.is_group && conversation.other_user_id && isUserOnline(conversation.other_user_id) && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-background" />
              )}
            </div>

            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={handleProfileClick}
            >
              <h2 className="font-semibold text-foreground truncate text-base">
                {conversation.is_group ? conversation.group_name : conversation.other_user_name}
              </h2>
              <div className="flex items-center gap-2">
                {conversation.is_group ? (
                  <p className="text-xs text-muted-foreground">
                    {conversation.member_count} members · Tap for info
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      @{conversation.other_user_username}
                    </p>
                    {conversation.other_user_id && isUserOnline(conversation.other_user_id) && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Online</Badge>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="h-10 w-10 active:scale-95 transition-transform ml-auto text-muted-foreground hover:bg-muted"
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-3 py-2 safe-top">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                }}
                className="-ml-2 h-10 w-10 active:scale-95 transition-transform text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 relative">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 bg-muted/50 rounded-full px-4 text-sm outline-none focus:bg-muted/80 transition-colors"
                />
              </div>
            </div>
            {searchQuery && (
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-xs text-muted-foreground">
                  {searchResults.length > 0 
                    ? `${currentSearchIndex + 1} of ${searchResults.length} results` 
                    : 'No results found'}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-muted"
                    onClick={handleSearchPrev}
                    disabled={searchResults.length === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-muted"
                    onClick={handleSearchNext}
                    disabled={searchResults.length === 0}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pinned Message Banner */}
        {pinnedMessage && (
          <div
            className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border cursor-pointer hover:bg-muted/70 transition-colors"
            onClick={() => scrollToMessage(pinnedMessage.id)}
          >
            <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-primary">Pinned Message</p>
              <p className="text-xs text-muted-foreground truncate">{pinnedMessage.content}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); unpinMessage(); }}
              className="shrink-0 h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 pb-20 space-y-3 overscroll-contain">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className="h-16 w-3/4 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-4">
            <div className="animate-fade-in">
              <p className="text-muted-foreground text-sm">
                No messages yet. Start the conversation!
              </p>
            </div>
          </div>
        ) : (
          groupedMessages.map((group, groupIdx) => {
            // --- MEDIA GROUP ---
            if (group.type === 'media_group') {
              const msgs = group.messages;
              const isOwn = group.senderId === currentUserId;
              const lastMsg = msgs[msgs.length - 1];
              const mediaItems: MediaItem[] = msgs.map((m: any) => ({
                id: m.id,
                url: m.attachment_url,
                type: (m.message_type || 'photo') as 'photo' | 'video',
                caption: m.content,
              }));
              const timestamp = formatDistanceToNow(new Date(lastMsg.created_at), { addSuffix: true });

              return (
                <div
                  key={`group-${msgs[0].id}`}
                  ref={(el) => { if (el) messageRefs.current.set(lastMsg.id, el); }}
                  className={`flex gap-2 animate-fade-in ${isOwn ? 'justify-end' : 'justify-start'}`}
                  onTouchStart={(e) => { handleLongPressStart(e, lastMsg); handleSwipeStart(e, lastMsg); }}
                  onTouchEnd={(e) => { handleLongPressEnd(); handleSwipeEnd(e); }}
                  onTouchMove={handleLongPressEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActionMenu({
                      isOpen: true,
                      message: {
                        id: lastMsg.id,
                        content: lastMsg.content || `${msgs.length} media`,
                        senderId: lastMsg.sender_id,
                        senderName: getSenderName(lastMsg.sender_id),
                        messageType: (lastMsg as any).message_type || 'photo',
                        attachmentUrl: (lastMsg as any).attachment_url,
                      },
                      position: { x: e.clientX, y: e.clientY },
                    });
                  }}
                >
                  {!isOwn && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1 cursor-pointer active:scale-95 transition-transform" onClick={handleProfileClick}>
                      <AvatarImage src={conversation.other_user_avatar || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-xs">
                        {conversation.other_user_initials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%] lg:max-w-[75%] min-w-0`}>
                    <div className={`rounded-xl shadow-sm overflow-hidden ${isOwn ? 'bg-primary/10 rounded-br-md' : 'bg-muted rounded-bl-md'
                      }`}>
                      <MediaGroupMosaic
                        items={mediaItems}
                        isOwn={isOwn}
                        timestamp={timestamp}
                        onOpenLightbox={(index) => setLightbox({ items: mediaItems, index })}
                      />
                      {(() => {
                        const groupCaption = mediaItems.find(
                          (mi) => mi.caption && mi.caption !== '📷 Photo' && mi.caption !== '🎥 Video'
                        )?.caption;
                        return groupCaption ? (
                          <p className={`px-3 pt-2 pb-1.5 text-[14px] whitespace-pre-wrap break-words ${isOwn ? 'text-foreground' : 'text-foreground'
                            }`} dir="auto" style={{ overflowWrap: 'anywhere' }}>
                            {groupCaption}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {isOwn && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarImage src={currentUserAvatar || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-xs">
                        {currentUserInitials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            }

            // --- SINGLE MESSAGE (unchanged logic) ---
            const message = group.message;
            const isOwn = message.sender_id === currentUserId;
            const msgType = (message as any).message_type || 'text';
            const hasMedia = msgType !== 'text' && (message as any).attachment_url;
            const msgReactions = getMessageReactions(message.id);
            const replyMsg = getReplyMessage((message as any).reply_to_id);
            const isEdited = (message as any).is_edited;
            const forwardedFrom = (message as any).forwarded_from_name;

            // For single photo/video, enable lightbox too
            const singleMediaItem: MediaItem | null = (msgType === 'photo' || msgType === 'video') && (message as any).attachment_url
              ? { id: message.id, url: (message as any).attachment_url, type: msgType as 'photo' | 'video', caption: message.content }
              : null;

            return (
              <div
                key={message.id}
                ref={(el) => { if (el) messageRefs.current.set(message.id, el); }}
                className={`flex gap-2 animate-fade-in transition-colors duration-500 rounded-xl ${isOwn ? 'justify-end' : 'justify-start'}`}
                onTouchStart={(e) => { handleLongPressStart(e, message); handleSwipeStart(e, message); }}
                onTouchEnd={(e) => { handleLongPressEnd(); handleSwipeEnd(e); }}
                onTouchMove={handleLongPressEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleLongPressStart(e as any, message);
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                  setActionMenu({
                    isOpen: true,
                    position: { x: e.clientX, y: e.clientY },
                    message: {
                      id: message.id,
                      content: message.content,
                      senderId: message.sender_id,
                      senderName: getSenderName(message.sender_id),
                      messageType: msgType,
                      attachmentUrl: (message as any).attachment_url,
                    },
                  });
                }}
              >
                {!isOwn && (
                  <Avatar
                    className="h-8 w-8 shrink-0 mt-1 cursor-pointer active:scale-95 transition-transform"
                    onClick={handleProfileClick}
                  >
                    <AvatarImage src={conversation.other_user_avatar || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-xs">
                      {conversation.other_user_initials}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[80%] min-w-0`}>
                  {forwardedFrom && (
                    <span className="text-[11px] text-muted-foreground italic mb-0.5 px-1">
                      Forwarded from {forwardedFrom}
                    </span>
                  )}

                  <div
                    className={`rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden transition-colors ${hasMedia
                      ? isOwn
                        ? 'bg-gradient-to-tr from-primary/95 to-primary/85 backdrop-blur-3xl border border-white/15 text-white rounded-br-[6px]'
                        : 'bg-card/85 dark:bg-[#1C1C1E]/85 backdrop-blur-3xl backdrop-saturate-200 border border-black/5 dark:border-white/10 text-foreground rounded-bl-[6px]'
                      : isOwn
                        ? 'bg-gradient-to-tr from-primary/95 to-primary/80 backdrop-blur-3xl border border-white/15 text-white rounded-br-[4px] px-[18px] py-[10px] tracking-[0.01em]'
                        : 'bg-card/85 dark:bg-[#1C1C1E]/80 backdrop-blur-3xl backdrop-saturate-200 border border-black/5 dark:border-white/10 text-foreground rounded-bl-[4px] px-[18px] py-[10px] tracking-[0.01em]'
                      } ${hasMedia ? 'p-1' : ''}`}
                    onClick={() => {
                      if (singleMediaItem) {
                        setLightbox({ items: [singleMediaItem], index: 0 });
                      }
                    }}
                  >
                    {replyMsg && (
                      <div
                        className={`mb-1 px-3 py-1.5 rounded-lg cursor-pointer text-xs border-l-2 max-w-full overflow-hidden ${isOwn
                          ? 'bg-primary-foreground/10 border-primary-foreground/40'
                          : 'bg-primary/10 border-primary/40'
                          }`}
                        onClick={() => scrollToMessage(replyMsg.id)}
                      >
                        <p className={`font-semibold truncate ${isOwn ? 'text-primary-foreground/80' : 'text-primary'}`}>
                          {replyMsg.senderName}
                        </p>
                        <p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-10 overflow-hidden ${isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                          {replyMsg.content}
                        </p>
                      </div>
                    )}

                    <div className={hasMedia ? 'p-0' : ''}>
                      {msgType === 'poll' && (message as any).attachment_url ? (
                        <PollMessageBubble
                          pollId={(message as any).attachment_url}
                          isOwn={isOwn}
                          currentUserId={currentUserId}
                        />
                      ) : (
                        <MessageBubble
                          content={message.content}
                          messageType={msgType}
                          attachmentUrl={(message as any).attachment_url}
                          isOwn={isOwn}
                          onInvitationClick={(id) => setInvitationModalId(id)}
                        />
                      )}
                    </div>

                    {isEdited && (
                      <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-primary-foreground/50' : 'text-muted-foreground/70'}`}>
                        edited
                      </p>
                    )}
                  </div>

                  {msgReactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1 -mt-2.5 relative z-[1] ${isOwn ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
                      {Object.entries(
                        msgReactions.reduce((acc: Record<string, { count: number; userReacted: boolean }>, r: any) => {
                          if (!acc[r.emoji]) acc[r.emoji] = { count: 0, userReacted: false };
                          acc[r.emoji].count++;
                          if (r.user_id === currentUserId) acc[r.emoji].userReacted = true;
                          return acc;
                        }, {} as Record<string, { count: number; userReacted: boolean }>)
                      ).map(([emoji, data]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction.mutate({ messageId: message.id, userId: currentUserId, emoji })}
                          className={`inline-flex items-center gap-0.5 text-sm px-1.5 py-0.5 rounded-full border shadow-sm transition-all active:scale-95 ${(data as any).userReacted
                            ? 'bg-primary/15 border-primary/40 shadow-primary/10'
                            : 'bg-background border-border'
                            }`}
                        >
                          <span className="text-base leading-none">{emoji}</span>
                          {(data as any).count > 1 && (
                            <span className="text-[10px] font-medium text-muted-foreground">{(data as any).count}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground mt-1 px-1 flex items-center gap-1">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    {isOwn && (
                      message.sync_status === 'pending'
                        ? <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                        : message.sync_status === 'failed'
                          ? <X className="h-3.5 w-3.5 text-destructive" />
                          : otherUserLastRead && new Date(otherUserLastRead) >= new Date(message.created_at)
                            ? <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                            : <Check className="h-3.5 w-3.5 text-muted-foreground/60" />
                    )}
                  </span>
                </div>

                {isOwn && (
                  <Avatar className="h-8 w-8 shrink-0 mt-1">
                    <AvatarImage src={currentUserAvatar || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-xs">
                      {currentUserInitials}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 text-sm text-muted-foreground italic animate-fade-in">
          {typingUsers[0]} is typing...
        </div>
      )}

      {/* Message Input */}
      <div className="flex-none fixed bottom-0 left-0 right-0 lg:sticky bg-background border-t border-border safe-bottom relative">
        {/* Reply / Edit preview bar */}
        {(replyTo || editingMessage) && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border animate-fade-in max-w-full overflow-hidden">
            <div className={`w-1 h-8 rounded-full ${editingMessage ? 'bg-amber-500' : 'bg-primary'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary flex items-center gap-1 truncate">
                {editingMessage ? (
                  <><Pencil className="h-3 w-3 shrink-0" /> Editing</>
                ) : (
                  <><Reply className="h-3 w-3 shrink-0" /> {replyTo?.senderName}</>
                )}
              </p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-10 overflow-hidden">
                {editingMessage?.content || replyTo?.content}
              </p>
            </div>
            <button
              onClick={() => { setReplyTo(null); setEditingMessage(null); setMessageText(''); }}
              className="shrink-0 h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 p-2 max-w-screen-xl mx-auto">
          <button
            onClick={() => setAttachmentSheetOpen(true)}
            className="shrink-0 h-11 w-11 rounded-full hover:bg-muted/60 flex items-center justify-center transition-colors active:scale-95"
          >
            <Plus className="h-6 w-6 text-muted-foreground" />
          </button>

          <textarea
            ref={textareaRef}
            value={messageText}
            onChange={handleTextChange}
            onKeyDown={handleKeyPress}
            onBlur={stopTyping}
            placeholder="Message..."
            className="flex-1 resize-none min-h-[44px] max-h-[120px] text-[16px] rounded-2xl bg-muted/50 border-0 px-4 py-2.5 outline-none focus:bg-muted/80 transition-colors placeholder:text-muted-foreground"
            rows={1}
            dir="auto"
          />

          {hasText ? (
            <button
              onClick={handleSendMessage}
              disabled={isSending || editMessage.isPending}
              className="shrink-0 h-11 w-11 rounded-full bg-primary flex items-center justify-center active:scale-90 transition-all disabled:opacity-50 shadow-sm"
            >
              {isSending || editMessage.isPending ? (
                <Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
              ) : editingMessage ? (
                <Pencil className="h-5 w-5 text-primary-foreground" />
              ) : (
                <Send className="h-5 w-5 text-primary-foreground" />
              )}
            </button>
          ) : (
            <VoiceRecorder
              conversationId={conversation.conversation_id}
              onSend={handleSendAttachment}
            />
          )}
        </div>
      </div>

      {/* Action Menu */}
      <MessageActionMenu
        isOpen={actionMenu.isOpen}
        isOwn={actionMenu.message?.senderId === currentUserId}
        position={actionMenu.position}
        onClose={() => setActionMenu(prev => ({ ...prev, isOpen: false }))}
        onReply={handleReply}
        onForward={handleForward}
        onCopy={handleCopy}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPin={handlePin}
        onReact={handleReact}
      />

      {/* Reaction Bar */}
      <ReactionBar
        isOpen={reactionBar.isOpen}
        position={reactionBar.position}
        onSelect={(emoji) => toggleReaction.mutate({ messageId: reactionBar.messageId, userId: currentUserId, emoji })}
        onClose={() => setReactionBar(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Delete Dialog */}
      <DeleteMessageDialog
        isOpen={deleteDialog.isOpen}
        isOwn={deleteDialog.message?.senderId === currentUserId}
        onClose={() => setDeleteDialog({ isOpen: false, message: null })}
        onDeleteForMe={() => {
          if (deleteDialog.message) {
            deleteForMe.mutate({
              messageId: deleteDialog.message.id,
              userId: currentUserId,
              conversationId: conversation.conversation_id,
            });
          }
          setDeleteDialog({ isOpen: false, message: null });
        }}
        onDeleteForEveryone={() => {
          if (deleteDialog.message) {
            deleteForEveryone.mutate({
              messageId: deleteDialog.message.id,
              conversationId: conversation.conversation_id,
            });
          }
          setDeleteDialog({ isOpen: false, message: null });
        }}
      />

      {/* Forward Modal */}
      <ForwardMessageModal
        isOpen={forwardModal.isOpen}
        onClose={() => setForwardModal({ isOpen: false, message: null })}
        conversations={(conversations || []).filter(c => c.conversation_id !== conversation.conversation_id)}
        onForward={(convIds) => {
          if (forwardModal.message) {
            forwardMessage.mutate({
              content: forwardModal.message.content,
              messageType: forwardModal.message.messageType,
              attachmentUrl: forwardModal.message.attachmentUrl,
              senderName: forwardModal.message.senderName,
              targetConversationIds: convIds,
              senderId: currentUserId,
            });
          }
        }}
      />

      {/* Attachment Sheet */}
      <TelegramAttachmentSheet
        open={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        conversationId={conversation.conversation_id}
        senderId={currentUserId}
        onSendAttachment={handleSendAttachment}
        onMediaSelected={handleMediaSelected}
      />

      {/* Media Preview */}
      {mediaPreview && (
        <MediaPreviewModal
          files={mediaPreview.files}
          mediaType={mediaPreview.type}
          onClose={() => setMediaPreview(null)}
          onSend={handleSendAttachment}
          conversationId={conversation.conversation_id}
          initialCaption={messageText}
          onCaptionConsumed={() => { setMessageText(''); setReplyTo(null); }}
        />
      )}

      {/* Media Lightbox */}
      {lightbox && (
        <MediaLightbox
          items={lightbox.items}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Circle Invitation Modal */}
      <CircleInvitationModal
        invitationId={invitationModalId}
        open={!!invitationModalId}
        onOpenChange={(open) => { if (!open) setInvitationModalId(null); }}
      />

      {/* Group Info Modal */}
      {conversation.is_group && (
        <GroupInfoModal
          isOpen={groupInfoOpen}
          onClose={() => setGroupInfoOpen(false)}
          conversationId={conversation.conversation_id}
          groupName={conversation.group_name || 'Group'}
          groupAvatarUrl={conversation.group_avatar_url}
          currentUserId={currentUserId}
        />
      )}

      {/* Media Gallery Modal */}
      <ChatMediaGalleryModal
        isOpen={mediaGalleryOpen}
        onClose={() => setMediaGalleryOpen(false)}
        messages={messages}
        profileName={conversation.is_group ? conversation.group_name || 'Group' : conversation.other_user_name || 'User'}
        profileAvatar={conversation.is_group ? conversation.group_avatar_url : conversation.other_user_avatar}
        profileInitials={conversation.other_user_initials}
        isGroup={!!conversation.is_group}
        memberCount={conversation.member_count}
        onViewProfile={handleNavigateToProfile}
        onMediaSelect={(url, type) => {
          // We can reuse the lightbox here logic by finding the item
          const singleMediaItem: MediaItem = { id: url, url, type };
          setLightbox({ items: [singleMediaItem], index: 0 });
        }}
      />
    </div>
  );
};

export default ChatView;
