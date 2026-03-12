import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeCheck, MessageCircle, Award, Clock, ArrowLeft, FileText, MessageSquare, Heart, MessageCircleMore } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useCreateConversation } from '@/hooks/useConversations';
import { usePresence } from '@/hooks/usePresence';
import { useUserPosts } from '@/hooks/useUserPosts';
import { useExpertAnswers } from '@/hooks/useExpertAnswers';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface ExpertProfileModalProps {
  open: boolean;
  onClose: () => void;
  expert: {
    user_id: string;
    specialty: string;
    bio?: string | null;
    years_experience?: number | null;
    certifications?: string[] | null;
    profiles?: {
      name?: string;
      username?: string;
      avatar_url?: string | null;
      initials?: string;
      avatar_color?: string;
    } | null;
    answer_likes?: number;
  } | null;
}

export const ExpertProfileModal: React.FC<ExpertProfileModalProps> = ({ open, onClose, expert }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { createConversation } = useCreateConversation();
  const { isUserOnline } = usePresence(user?.id);
  const [isDmLoading, setIsDmLoading] = useState(false);

  const { posts, isLoading: postsLoading } = useUserPosts(expert?.user_id);
  const { data: answers, isLoading: answersLoading } = useExpertAnswers(expert?.user_id);

  if (!open || !expert) return null;

  const isOnline = isUserOnline(expert.user_id);
  const profile = expert.profiles;

  const handleDmExpert = async () => {
    if (!user?.id) {
      toast.error('Please sign in to message experts');
      return;
    }
    if (user.id === expert.user_id) {
      toast.info("You can't message yourself");
      return;
    }
    setIsDmLoading(true);
    try {
      await createConversation(user.id, expert.user_id);
      onClose();
      navigate(`/messages?userId=${expert.user_id}`);
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error('Failed to start conversation');
    } finally {
      setIsDmLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background/80 to-accent/20 backdrop-blur-xl" />

      <div className="relative h-full w-full overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-background/30 backdrop-blur-lg border-b border-border/30">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold text-foreground">Expert Profile</h1>
          <div className="w-10" />
        </div>

        {/* Profile hero */}
        <div className="flex flex-col items-center text-center px-6 pt-8 pb-4 space-y-4">
          {/* Avatar with glass ring */}
          <div className="relative">
            <div className="rounded-full p-1 bg-gradient-to-br from-primary/40 to-accent/40 backdrop-blur-sm">
              <Avatar className="w-24 h-24 border-2 border-background/60">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback
                  className="text-xl text-white font-bold"
                  style={{ backgroundColor: profile?.avatar_color }}
                >
                  {profile?.initials}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className={`absolute bottom-1 right-1 w-4.5 h-4.5 rounded-full border-2 border-background ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          </div>

          {/* Name + badge */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-xl font-bold text-foreground">{profile?.name || profile?.username || 'Expert'}</h2>
              <BadgeCheck className="w-5 h-5 text-primary" />
            </div>
            <Badge className="text-xs bg-primary/15 text-primary border-primary/25 backdrop-blur-sm">
              Verified Expert
            </Badge>
            <p className="text-xs text-muted-foreground">{isOnline ? '🟢 Online now' : 'Offline'}</p>
          </div>

          {/* Stats cards */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-card/50 backdrop-blur-sm border border-border/30">
              <Award className="w-4 h-4 text-primary mb-1" />
              <span className="text-xs font-semibold text-foreground">{expert.specialty}</span>
              <span className="text-[10px] text-muted-foreground">Specialty</span>
            </div>
            {expert.years_experience && (
              <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-card/50 backdrop-blur-sm border border-border/30">
                <Clock className="w-4 h-4 text-primary mb-1" />
                <span className="text-xs font-semibold text-foreground">{expert.years_experience}y</span>
                <span className="text-[10px] text-muted-foreground">Experience</span>
              </div>
            )}
            {(expert.answer_likes ?? 0) > 0 && (
              <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-card/50 backdrop-blur-sm border border-border/30">
                <span className="text-sm mb-1">👍</span>
                <span className="text-xs font-semibold text-foreground">{expert.answer_likes}</span>
                <span className="text-[10px] text-muted-foreground">Likes</span>
              </div>
            )}
          </div>

          {/* About section */}
          {expert.bio && (
            <div className="w-full text-left rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-3.5 space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">About</h3>
              <p className="text-sm leading-relaxed text-foreground">{expert.bio}</p>
            </div>
          )}

          {/* Certifications */}
          {expert.certifications && expert.certifications.length > 0 && (
            <div className="w-full text-left space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Certifications</h3>
              <div className="flex flex-wrap gap-1.5">
                {expert.certifications.map((cert, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-card/40 backdrop-blur-sm border-border/40">
                    {cert}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* DM button */}
          <Button
            className="w-full gap-2 rounded-xl"
            size="lg"
            onClick={handleDmExpert}
            disabled={isDmLoading}
          >
            <MessageCircle className="w-4 h-4" />
            {isDmLoading ? 'Opening chat...' : 'DM Expert'}
          </Button>
        </div>

        {/* Tabs section */}
        <div className="px-4 pb-8">
          <Tabs defaultValue="posts" className="w-full">
            <TabsList className="w-full grid grid-cols-2 bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl">
              <TabsTrigger value="posts" className="gap-1.5 rounded-lg data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                <FileText className="w-3.5 h-3.5" />
                Posts
              </TabsTrigger>
              <TabsTrigger value="answers" className="gap-1.5 rounded-lg data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                <MessageSquare className="w-3.5 h-3.5" />
                Answers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="mt-3 space-y-3">
              {postsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              ) : posts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No posts yet
                </div>
              ) : (
                posts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-4 space-y-2 transition-colors hover:bg-card/60"
                    onClick={() => {
                      onClose();
                      navigate(`/post/${post.id}`);
                    }}
                  >
                    <p className="text-sm text-foreground line-clamp-3">{post.content}</p>
                    {post.media_url && (
                      <img src={post.media_url} alt="" className="rounded-lg w-full max-h-40 object-cover" />
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {post.likes_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircleMore className="w-3 h-3" /> {post.comments_count}
                      </span>
                      <span className="ml-auto">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="answers" className="mt-3 space-y-3">
              {answersLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-4 space-y-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))
              ) : !answers || answers.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No answers yet
                </div>
              ) : (
                answers.map((item: any) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-4 space-y-2 transition-colors hover:bg-card/60"
                    onClick={() => {
                      onClose();
                      navigate(`/question/${item.question_id}`);
                    }}
                  >
                    {item.question_text && (
                      <p className="text-xs font-medium text-primary line-clamp-1">Q: {item.question_text}</p>
                    )}
                    <p className="text-sm text-foreground line-clamp-3">{item.answer}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                      {item.is_helpful && (
                        <Badge variant="outline" className="text-[10px] h-5 border-green-500/30 text-green-600">
                          ✓ Helpful
                        </Badge>
                      )}
                      <span className="ml-auto">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
