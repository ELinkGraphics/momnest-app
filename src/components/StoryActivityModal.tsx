import React, { useState } from 'react';
import { X, Eye, Heart, MessageCircle, BarChart3, ArrowLeft, Send } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useStoryActivity } from '@/hooks/useStoryActivity';
import { useUser } from '@/contexts/UserContext';
import { formatDistanceToNow } from 'date-fns';
import { useRef, useEffect } from 'react';

interface StoryActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
}

const StoryActivityModal: React.FC<StoryActivityModalProps> = ({ isOpen, onClose, storyId }) => {
  const { user } = useUser();
  const { viewsCount, likesCount, reach, viewers, messages, isLoading, sendReply } = useStoryActivity(storyId);
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [chatUserName, setChatUserName] = useState('');
  const [replyText, setReplyText] = useState('');

  const [visibleViews, setVisibleViews] = useState(20);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const chatMessages = [...messages]
    .filter(m => m.sender_id === chatUserId || (m as any).receiver_id === chatUserId)
    .reverse(); // Reverse to show oldest at top, newest at bottom

  useEffect(() => {
    if (chatUserId) {
      chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages.length, chatUserId]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !chatUserId) return;
    await sendReply(chatUserId, replyText.trim());
    setReplyText('');
  };

  // Chat view
  if (chatUserId) {
    return (
      <div className="fixed inset-0 z-[110] flex items-end justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-background rounded-t-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
          {/* Chat header */}
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <button onClick={() => setChatUserId(null)} className="p-1 hover:bg-muted rounded-full">
              <ArrowLeft className="size-5 text-foreground" />
            </button>
            <span className="font-semibold text-foreground">{chatUserName}</span>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">No messages yet</p>
            )}
            {chatMessages.map(msg => {
              const isOwn = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  {!isOwn && (
                    <Avatar className="size-8">
                      <AvatarImage src={msg.profile?.avatar_url || undefined} />
                      <AvatarFallback style={{ backgroundColor: msg.profile?.avatar_color || '#888' }} className="text-xs text-white">
                        {msg.profile?.initials || '??'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={isOwn ? 'text-right' : ''}>
                    <p className={`text-sm rounded-xl px-3 py-2 ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{msg.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={chatScrollRef} />
          </div>

          {/* Reply input */}
          <div className="p-4 border-t border-border flex items-center gap-2">
            <input
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Reply..."
              className="flex-1 bg-muted rounded-full px-4 py-2 text-sm text-foreground outline-none"
              onKeyDown={e => e.key === 'Enter' && handleSendReply()}
            />
            {replyText.trim() && (
              <button onClick={handleSendReply} className="p-2 text-primary hover:text-primary/80">
                <Send className="size-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background rounded-t-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-lg text-foreground">Story Activity</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        <Tabs defaultValue="insights" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-around bg-muted/50 mx-4 mt-2" style={{ width: 'calc(100% - 2rem)' }}>
            <TabsTrigger value="insights" className="flex-1 gap-1 text-xs">
              <BarChart3 className="size-3.5" /> Insights
            </TabsTrigger>
            <TabsTrigger value="views" className="flex-1 gap-1 text-xs">
              <Eye className="size-3.5" /> Views
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex-1 gap-1 text-xs">
              <MessageCircle className="size-3.5" /> Messages
            </TabsTrigger>
          </TabsList>

          {/* Insights Tab */}
          <TabsContent value="insights" className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <InsightCard icon={<Eye className="size-5 text-primary" />} label="Reach" value={reach} />
                <InsightCard icon={<Eye className="size-5 text-secondary" />} label="Views" value={viewsCount} />
                <InsightCard icon={<Heart className="size-5 text-destructive" />} label="Likes" value={likesCount} />
              </div>
            )}
          </TabsContent>

          {/* Views Tab */}
          <TabsContent value="views" className="flex-1 overflow-y-auto p-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : viewers.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No views yet</p>
            ) : (
              viewers.slice(0, visibleViews).map(viewer => (
                <div key={viewer.id} className="flex items-center gap-3 py-2">
                  <Avatar className="size-10">
                    <AvatarImage src={viewer.profile?.avatar_url || undefined} />
                    <AvatarFallback style={{ backgroundColor: viewer.profile?.avatar_color || '#888' }} className="text-xs text-white">
                      {viewer.profile?.initials || '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{viewer.profile?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(viewer.viewed_at), { addSuffix: true })}
                    </p>
                  </div>
                  {viewer.hasLiked && (
                    <Heart className="size-4 fill-destructive text-destructive shrink-0" />
                  )}
                </div>
              ))
            )}
            {viewers.length > visibleViews && (
              <button 
                onClick={() => setVisibleViews(prev => prev + 20)}
                className="w-full py-2 text-sm text-primary hover:bg-muted rounded-lg transition-colors"
              >
                Load more
              </button>
            )}
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="flex-1 overflow-y-auto p-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No messages yet</p>
            ) : (
              // Group by sender, show latest message per sender
              Array.from(
                messages.reduce((map, msg) => {
                  if (!map.has(msg.sender_id)) map.set(msg.sender_id, msg);
                  return map;
                }, new Map<string, typeof messages[0]>())
              ).map(([senderId, msg]) => (
                <button
                  key={senderId}
                  onClick={() => {
                    setChatUserId(senderId);
                    setChatUserName(msg.profile?.name || 'Unknown');
                  }}
                  className="flex items-center gap-3 py-2 w-full text-left hover:bg-muted/50 rounded-lg px-2 transition-colors"
                >
                  <Avatar className="size-10">
                    <AvatarImage src={msg.profile?.avatar_url || undefined} />
                    <AvatarFallback style={{ backgroundColor: msg.profile?.avatar_color || '#888' }} className="text-xs text-white">
                      {msg.profile?.initials || '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{msg.profile?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">{msg.content}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                </button>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const InsightCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="bg-muted/50 rounded-xl p-4 flex flex-col items-center gap-2">
    {icon}
    <span className="text-2xl font-bold text-foreground">{value}</span>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
);

export default StoryActivityModal;
