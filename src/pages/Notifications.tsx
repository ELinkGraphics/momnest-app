import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Trash2, Heart, MessageCircle, UserPlus, Video, CheckCheck, AtSign, Users, HelpCircle, Bell, BellOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import FooterNav from '@/components/FooterNav';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useSwipeGestures } from '@/hooks/useSwipeGestures';
import { toast } from 'sonner';

// ─── Notification type helpers ──────────────────────────────────────

type NotifType =
  | 'like' | 'comment' | 'follow' | 'mention'
  | 'new_post' | 'new_video' | 'story_mention'
  | 'live_start'
  | 'circle_member' | 'circle_post' | 'circle_event'
  | 'question_answer' | 'answer_vote'
  | 'event' | 'reward';

const ICON_MAP: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  new_post: MessageCircle,
  new_video: Video,
  story_mention: AtSign,
  mention: AtSign,
  live_start: Video,
  circle_member: Users,
  circle_post: Users,
  circle_event: Users,
  question_answer: HelpCircle,
  answer_vote: HelpCircle,
};

const COLOR_MAP: Record<string, string> = {
  like: 'bg-destructive/15 text-destructive',
  comment: 'bg-primary/15 text-primary',
  follow: 'bg-success/20 text-success',
  new_post: 'bg-secondary/15 text-secondary',
  new_video: 'bg-accent text-accent-foreground',
  story_mention: 'bg-secondary/15 text-secondary',
  mention: 'bg-secondary/15 text-secondary',
  live_start: 'bg-destructive/15 text-destructive',
  circle_member: 'bg-primary/15 text-primary',
  circle_post: 'bg-primary/15 text-primary',
  circle_event: 'bg-primary/15 text-primary',
  question_answer: 'bg-tertiary text-tertiary-foreground',
  answer_vote: 'bg-tertiary text-tertiary-foreground',
};

const isSocial = (t: string) => ['like', 'comment', 'follow', 'new_post', 'new_video', 'story_mention', 'mention', 'live_start'].includes(t);
const isCircle = (t: string) => ['circle_member', 'circle_post', 'circle_event'].includes(t);
const isMention = (t: string) => ['story_mention', 'mention'].includes(t);

// ─── Main component ─────────────────────────────────────────────────

const Notifications = () => {
  const navigate = useNavigate();
  const { notifications: dbNotifications, isLoading, unreadCount, markAsRead } = useNotifications();
  const [activeTab, setActiveTab] = useState('all');
  const [reshareDialog, setReshareDialog] = useState<{ storyId: string; mentionerName: string } | null>(null);
  const [isResharing, setIsResharing] = useState(false);

  // Fetch only referenced profiles
  const profileIds = Array.from(new Set(
    dbNotifications.map(n => (n.data as any)?.userId).filter(Boolean) as string[]
  ));

  const { data: profiles } = useQuery({
    queryKey: ['notification-profiles', profileIds.join(',')],
    queryFn: async () => {
      if (profileIds.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, initials, avatar_color')
        .in('id', profileIds);
      return data || [];
    },
    staleTime: 60000,
    enabled: profileIds.length > 0,
  });

  const getProfile = (userId: string) => profiles?.find(p => p.id === userId);

  // Realtime for mentions
  useEffect(() => {
    const channel = supabase
      .channel('notification-mentions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'push_notifications' }, (payload) => {
        const n = payload.new as any;
        if (n && isMention(n.notification_type)) {
          toast('📢 Someone mentioned you!', { duration: 4000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Actions ────────────────────────────────────────────

  const markAllAsRead = async () => {
    const unreadIds = dbNotifications.filter(n => !n.read_at).map(n => n.id);
    for (const id of unreadIds) {
      await markAsRead.mutateAsync(id);
    }
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase.from('push_notifications').delete().eq('id', id);
    if (error) toast.error('Failed to delete notification');
  };

  const handleNotificationClick = (notification: any) => {
    const data = notification.data || {};
    if (!notification.read_at) markAsRead.mutate(notification.id);

    switch (notification.notification_type) {
      case 'like':
      case 'comment':
      case 'new_post':
        if (data.type === 'video_comment' || data.type === 'video_like') {
          navigate('/', { state: { feedMode: 'relax', videoId: data.videoId, openComments: data.type === 'video_comment' } });
        } else if (data.postId) {
          navigate(`/post/${data.postId}`);
        }
        break;
      case 'new_video':
        if (data.videoId) navigate('/', { state: { feedMode: 'relax', videoId: data.videoId } });
        break;
      case 'follow':
        if (data.userId) navigate(`/profile/${data.userId}`);
        break;
      case 'mention':
        if (data.postId) navigate(`/post/${data.postId}`);
        else if (data.videoId) navigate('/', { state: { feedMode: 'relax', videoId: data.videoId } });
        break;
      case 'circle_member':
      case 'circle_event':
        if (data.circleId) navigate(`/circles/${data.circleId}`);
        break;
      case 'circle_post':
        if (data.postId && data.circleId) navigate(`/circles/${data.circleId}/post/${data.postId}`);
        else if (data.circleId) navigate(`/circles/${data.circleId}`);
        break;
      case 'live_start':
        if (data.streamId) navigate(`/live/${data.streamId}`);
        break;
      case 'question_answer':
      case 'answer_vote':
        if (data.questionId) navigate(`/ask/question/${data.questionId}`);
        break;
      case 'story_mention':
        if (data.story_id) {
          const mentionerProfile = data.mentioner_id ? getProfile(data.mentioner_id) : null;
          setReshareDialog({
            storyId: data.story_id,
            mentionerName: mentionerProfile?.name || notification.title?.split(' mentioned')[0] || 'Someone',
          });
        }
        break;
      case 'order':
      case 'order_update':
      case 'order_shipped':
      case 'order_delivered':
        if (data.orderId) navigate(`/order/${data.orderId}`);
        else navigate('/order-history');
        break;
      case 'message':
      case 'new_message':
        if (data.conversationId) navigate('/messages', { state: { conversationId: data.conversationId } });
        else navigate('/messages');
        break;
      case 'safety':
      case 'sos_alert':
      case 'helper_request':
        navigate('/', { state: { activeTab: 'safe' } });
        break;
      case 'event':
        if (data.circleId) navigate(`/circles/${data.circleId}`);
        break;
      case 'reward':
      case 'achievement':
        navigate('/profile');
        break;
      case 'product_review':
        if (data.productId) navigate(`/product/${data.productId}`);
        break;
      case 'dispute':
      case 'dispute_update':
        if (data.disputeId) navigate('/disputes');
        break;
      default:
        // Fallback: try common data fields
        if (data.postId) navigate(`/post/${data.postId}`);
        else if (data.videoId) navigate('/', { state: { feedMode: 'relax', videoId: data.videoId } });
        else if (data.circleId) navigate(`/circles/${data.circleId}`);
        else if (data.orderId) navigate(`/order/${data.orderId}`);
        else if (data.conversationId) navigate('/messages', { state: { conversationId: data.conversationId } });
        else if (data.questionId) navigate(`/ask/question/${data.questionId}`);
        else if (data.userId) navigate(`/profile/${data.userId}`);
        break;
    }
  };

  const handleReshareConfirm = async () => {
    if (!reshareDialog) return;
    setIsResharing(true);
    try {
      const { data: story } = await supabase.from('stories').select('media_url, media_type').eq('id', reshareDialog.storyId).single();
      if (!story) throw new Error('Story not found');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: story.media_url,
        media_type: story.media_type,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reshared_story_id: reshareDialog.storyId,
      } as any);
      if (error) throw error;
      toast.success('Story reshared!');
    } catch {
      toast.error('Failed to reshare story');
    } finally {
      setIsResharing(false);
      setReshareDialog(null);
    }
  };

  // ─── Filtering ──────────────────────────────────────────

  const socialCount = dbNotifications.filter(n => isSocial(n.notification_type)).length;
  const circleCount = dbNotifications.filter(n => isCircle(n.notification_type)).length;
  const mentionCount = dbNotifications.filter(n => isMention(n.notification_type)).length;

  const filtered = (() => {
    switch (activeTab) {
      case 'unread': return dbNotifications.filter(n => !n.read_at);
      case 'social': return dbNotifications.filter(n => isSocial(n.notification_type));
      case 'circles': return dbNotifications.filter(n => isCircle(n.notification_type));
      case 'mentions': return dbNotifications.filter(n => isMention(n.notification_type));
      default: return dbNotifications;
    }
  })();

  // ─── Render ─────────────────────────────────────────────

  if (isLoading && !dbNotifications.length) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-xl border-b border-border z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">{unreadCount} new</p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs text-primary hover:text-primary/80">
              <CheckCheck className="size-3.5 mr-1" />
              Read all
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-[53px] bg-background/80 backdrop-blur-xl border-b border-border z-10">
          <TabsList className="w-full h-10 bg-transparent justify-start rounded-none p-0 gap-0">
            <TabsTrigger value="all" className="flex-1 rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary">
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex-1 rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary">
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
            <TabsTrigger value="social" className="flex-1 rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary">
              Social
            </TabsTrigger>
            <TabsTrigger value="circles" className="flex-1 rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary">
              Circles
            </TabsTrigger>
            <TabsTrigger value="mentions" className="flex-1 rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary">
              <AtSign className="size-3 mr-0.5" />
              Mentions
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Single content area for all tabs */}
        {['all', 'unread', 'social', 'circles', 'mentions'].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-0">
            {filtered.length === 0 ? (
              <EmptyState tab={activeTab} />
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(notification => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    profile={(notification.data as any)?.userId ? getProfile((notification.data as any).userId) : null}
                    onClickItem={handleNotificationClick}
                    onMarkRead={(id) => markAsRead.mutate(id)}
                    onDelete={deleteNotification}
                    onNavigateProfile={(userId) => navigate(`/profile/${userId}`)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Swipe hint */}
      {dbNotifications.length > 0 && (
        <div className="px-4 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">
            ← Swipe to delete • Swipe to mark read →
          </p>
        </div>
      )}

      {/* Reshare Dialog */}
      <AlertDialog open={!!reshareDialog} onOpenChange={(open) => !open && setReshareDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reshare to your story?</AlertDialogTitle>
            <AlertDialogDescription>
              {reshareDialog?.mentionerName} mentioned you in their story. Would you like to reshare it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResharing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReshareConfirm} disabled={isResharing}>
              {isResharing ? 'Resharing...' : 'Reshare'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FooterNav active="home" onSelect={() => {}} onOpenCreate={() => {}} />
    </div>
  );
};

// ─── Notification Item ────────────────────────────────────────

interface NotificationItemProps {
  notification: any;
  profile: any;
  onClickItem: (n: any) => void;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigateProfile: (userId: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification, profile, onClickItem, onMarkRead, onDelete, onNavigateProfile,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const Icon = ICON_MAP[notification.notification_type] || Bell;
  const colorClass = COLOR_MAP[notification.notification_type] || 'bg-muted text-muted-foreground';
  const isUnread = !notification.read_at;

  const swipeHandlers = useSwipeGestures(
    {
      onSwipeLeft: () => {
        setIsDeleting(true);
        setTimeout(() => onDelete(notification.id), 300);
      },
      onSwipeRight: () => {
        if (isUnread) {
          onMarkRead(notification.id);
          toast.success('Marked as read');
        }
      },
    },
    { threshold: 100 }
  );

  return (
    <div
      {...swipeHandlers}
      className={`relative px-4 py-3 transition-all cursor-pointer ${
        isUnread ? 'bg-primary/[0.04] border-l-2 border-l-primary' : 'hover:bg-muted/50'
      } ${isDeleting ? 'opacity-0 -translate-x-full' : ''}`}
      style={{ transition: 'opacity 0.3s, transform 0.3s' }}
      onClick={() => onClickItem(notification)}
    >
      <div className="flex items-start gap-3">
        {/* Avatar or Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {profile ? (
            <Avatar
              className="size-10 ring-2 ring-background shadow-sm cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onNavigateProfile(profile.id); }}
            >
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback
                className="text-xs font-semibold"
                style={{ backgroundColor: profile.avatar_color, color: '#fff' }}
              >
                {profile.initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className={`size-10 rounded-full flex items-center justify-center ${colorClass}`}>
              <Icon className="size-4.5" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-foreground truncate flex-1">
              {notification.title}
            </p>
            {isUnread && <div className="size-2 bg-primary rounded-full flex-shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-1">
            {notification.body}
          </p>
          <span className="text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(notification.sent_at), { addSuffix: true })}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-1">
          {isUnread && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id); }}
              className="h-6 w-6 hover:bg-primary/10 hover:text-primary"
              title="Mark as read"
            >
              <Check className="size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setIsDeleting(true); setTimeout(() => onDelete(notification.id), 300); }}
            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────

const EmptyState: React.FC<{ tab: string }> = ({ tab }) => {
  const messages: Record<string, { icon: typeof Bell; title: string; desc: string }> = {
    all: { icon: Bell, title: 'All caught up!', desc: 'No notifications yet. Interact with posts, join circles, and connect with others.' },
    unread: { icon: CheckCheck, title: 'No unread notifications', desc: "You're all caught up! Great job staying on top of things." },
    social: { icon: Heart, title: 'No social updates', desc: 'Like posts, follow people, and comment to start seeing social notifications.' },
    circles: { icon: Users, title: 'No circle activity', desc: 'Join circles to receive updates about events, posts, and new members.' },
    mentions: { icon: AtSign, title: 'No mentions yet', desc: 'When someone mentions you in a story or post, it will appear here.' },
  };

  const { icon: Icon, title, desc } = messages[tab] || messages.all;

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[260px]">{desc}</p>
    </div>
  );
};

export default Notifications;
