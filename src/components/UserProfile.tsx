import React, { useState, useEffect } from 'react';
import { MoreHorizontal, MessageCircle, Heart, Share, Bookmark, Plus, Check, MapPin, Link as LinkIcon, Calendar, Users, Video as VideoIcon, ChevronDown, ChevronUp, Image, X, Pencil, Wallet, Play, Award, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUser } from '@/contexts/UserContext';
import { ProfileHeaderSkeleton, PostCardSkeleton, VideoCardSkeleton, TabContentSkeleton } from '@/components/ui/loading-states';
import EditProfileModal from '@/components/EditProfileModal';
import { BioRichTextRenderer } from '@/components/BioRichTextRenderer';
import { useUserPosts } from '@/hooks/useUserPosts';
import { usePostMutations } from '@/hooks/usePostMutations';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { supabase } from '@/integrations/supabase/client';
import WalletModal from '@/components/wallet/WalletModal';
import ExpertVerificationModal from '@/components/ExpertVerificationModal';

interface UserProfileProps {
  className?: string;
  showHeader?: boolean;
  onMessageClick?: () => void;
  onSettingsClick?: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ 
  className = "", 
  showHeader = true,
  onMessageClick,
  onSettingsClick
}) => {
  const [activeTab, setActiveTab] = useState('posts');
  const [showFullBio, setShowFullBio] = useState(false);
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showExpertModal, setShowExpertModal] = useState(false);
  const [realtimeStats, setRealtimeStats] = useState<{ followers: number; following: number } | null>(null);
  const [userVideos, setUserVideos] = useState<any[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const { user, isLoading } = useUser();
  const { posts: userPosts, isLoading: postsLoading } = useUserPosts(user?.id);
  const { savedPosts, isLoading: savedLoading } = useSavedPosts(user?.id);
  const { toggleLike } = usePostMutations();
  const navigate = useNavigate();

  // Fetch real-time follower/following counts
  useEffect(() => {
    if (!user?.id) return;

    const fetchStats = async () => {
      const { data } = await supabase
        .from('profile_stats')
        .select('followers_count, following_count')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setRealtimeStats({ followers: data.followers_count || 0, following: data.following_count || 0 });
      }
    };
    fetchStats();

    const channel = supabase
      .channel('own-profile-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Fetch real videos
  useEffect(() => {
    if (!user?.id) return;
    setVideosLoading(true);
    const fetchVideos = async () => {
      const { data } = await supabase
        .from('videos')
        .select('*, video_stats(likes_count, comments_count, views_count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setUserVideos(data || []);
      setVideosLoading(false);
    };
    fetchVideos();
  }, [user?.id]);

  if (isLoading || !user) {
    return (
      <div className={`w-full ${className}`}>
        <ProfileHeaderSkeleton />
        <div className="px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 skeleton rounded-2xl" />
            ))}
          </div>
          <TabContentSkeleton />
        </div>
      </div>
    );
  }

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return "now";
  };

  /** Format ISO date to "Joined since YYYY" */
  const formatJoinedDate = (dateStr: string) => {
    try {
      const year = new Date(dateStr).getFullYear();
      return `Joined since ${year}`;
    } catch {
      return dateStr;
    }
  };

  /** Render text with hashtag highlighting */
  const renderFormattedText = (text: string) => {
    return text.split(' ').map((word, i) =>
      word.startsWith('#') ? <span key={i} className="text-primary font-medium">{word} </span> : word + ' '
    );
  };

  /** Truncatable text with "Read more" and hashtag support */
  const TruncatedText = ({ text, maxLength = 100, className: cls = '' }: { text: string; maxLength?: number; className?: string }) => {
    const [expanded, setExpanded] = useState(false);
    if (!text) return null;
    const shouldTruncate = text.length > maxLength;
    const displayText = shouldTruncate && !expanded ? text.slice(0, maxLength) + '...' : text;
    return (
      <p className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words ${cls}`} dir="auto">
        {renderFormattedText(displayText)}
        {shouldTruncate && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="ml-1 text-muted-foreground hover:text-primary font-medium text-[13px]"
          >
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </p>
    );
  };

  const PostCard = ({ post }: { post: any }) => {
    const handlePostClick = () => {
      navigate(`/post/${post.id}`);
    };

    // Detect image from regular posts or circle premium posts
    const isPdf = post.post_type?.toLowerCase() === 'pdf';
    
    const displayImage = isPdf 
      ? (Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : post.cover_image_url || post.media_url)
      : (post.media_url || post.cover_image_url || (Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls[0] : null));

    const isVideo = (url: string) => /\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(url);
    const videoUrl = [post.media_url, ...(post.media_urls || [])].find(url => url && isVideo(url));

    return (
      <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-all duration-300" onClick={handlePostClick}>
        <div className="aspect-[4/5] relative overflow-hidden bg-black/5">
          {videoUrl ? (
            <video 
              src={videoUrl} 
              poster={displayImage && !isVideo(displayImage) ? displayImage : undefined}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
              playsInline
            />
          ) : displayImage ? (
            <img 
              src={displayImage} 
              alt="" 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/30 p-4">
              <p className="text-[10px] text-muted-foreground text-center line-clamp-3 italic opacity-60">{post.content}</p>
            </div>
          )}
          
          {videoUrl && (
            <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md rounded-full p-1.5 border border-white/10 shadow-sm transition-transform group-hover:scale-110">
              <div className="w-0 h-0 border-y-[4px] border-y-transparent border-l-[6px] border-l-white ml-0.5" />
            </div>
          )}
          
          {videoUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/30 backdrop-blur-md rounded-full p-2 border border-white/20 shadow-2xl">
                <Play className="size-5 text-white fill-white opacity-90" />
              </div>
            </div>
          )}

          {/* Glassmorphic Overlay for Caption */}
          <div className="absolute inset-x-0 bottom-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="bg-background/20 backdrop-blur-md border border-white/10 rounded-xl p-2 shadow-lg">
              <p className="text-[10px] text-white line-clamp-1 font-medium">{post.content || "View post"}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const VideoCard = ({ video }: { video: any }) => {
    const handleVideoClick = () => {
      navigate(`/video/${video.id}`);
    };

    return (
      <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-all duration-300" onClick={handleVideoClick}>
        <div className="aspect-[9/16] relative overflow-hidden bg-black/5">
          {video.thumbnail_url ? (
            <img 
              src={video.thumbnail_url} 
              alt={video.title} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
            />
          ) : video.video_url ? (
            <video 
              src={video.video_url} 
              className="w-full h-full object-cover" 
              preload="metadata"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <VideoIcon className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
          
          {/* Glassmorphic Play Badge */}
          <div className="absolute top-2 right-2 bg-black/20 backdrop-blur-md border border-white/10 rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
            <Play className="h-2.5 w-2.5 text-white fill-white" />
            <span className="text-[10px] font-bold text-white">
              {video.video_stats?.[0]?.views_count || video.video_stats?.views_count || 0}
            </span>
          </div>

          {/* Glassmorphic Info Banner */}
          <div className="absolute inset-x-2 bottom-2 p-2 bg-black/20 backdrop-blur-md border border-white/20 rounded-xl shadow-lg transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            <p className="text-[11px] font-semibold text-white line-clamp-1">{video.title || "Untitled Video"}</p>
          </div>
        </div>
      </div>
    );
  };

  const EmptyState = ({ icon: Icon, title, description, ctaText, onCtaClick }: {
    icon: React.ElementType;
    title: string;
    description: string;
    ctaText?: string;
    onCtaClick?: () => void;
  }) => (
    <Card className="p-12 text-center rounded-2xl border border-border/50 bg-muted/20">
      <Icon className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
      <h3 className="text-lg font-semibold text-foreground mb-3">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{description}</p>
      {ctaText && onCtaClick && (
        <Button onClick={onCtaClick} className="min-h-[40px]">
          {ctaText}
        </Button>
      )}
    </Card>
  );

  const bio = user.bio || user.subtitle || "Living life to the fullest and sharing my journey with amazing people. Always excited to connect and learn from this incredible community!";
  const shouldTruncateBio = bio.length > 150;
  const displayBio = shouldTruncateBio && !showFullBio ? bio.slice(0, 150) + "..." : bio;

  // Links Modal Component
  const LinksModal = () => {
    if (!user.website) return null;
    
    const links = Array.isArray(user.website) ? user.website : [user.website];
    
    return (
      <Dialog open={showLinksModal} onOpenChange={setShowLinksModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Links
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {links.filter(link => link).map((link, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground truncate">
                    {link.replace(/^https?:\/\//, '')}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}
                  className="ml-2 flex-shrink-0"
                >
                  Open
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Cover Image */}
      <div className="relative h-48 sm:h-56 md:h-64 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center blur-sm scale-110"
          style={{
            backgroundImage: `url('${user.coverImage || 'https://images.unsplash.com/photo-1579952363873-27d3bfad9c0d?auto=format&fit=crop&w=1200&q=80'}')`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
        
        {/* Header controls */}
        {showHeader && (
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <Button 
              variant="outline"
              size="icon"
              onClick={onMessageClick}
              className="bg-background/80 backdrop-blur-sm border-border/50 hover:bg-background/90 min-h-[40px] min-w-[40px]"
            >
              <MessageCircle className="h-5 w-5" />
            </Button>
            <Button 
              variant="outline"
              size="icon"
              onClick={onSettingsClick}
              className="bg-background/80 backdrop-blur-sm border-border/50 hover:bg-background/90 min-h-[40px] min-w-[40px]"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Profile Content */}
      <div className="relative bg-background pb-32">
        {/* Avatar */}
        <div className="absolute -top-16 left-4 sm:left-6">
          <Avatar className="h-32 w-32 ring-4 ring-background shadow-xl">
            <AvatarImage 
              src={user.avatar || "https://picsum.photos/200/200?random=profile"} 
              alt={user.name}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold text-2xl">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          
          {/* Online Status */}
          {user.isOnline && (
            <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 border-3 border-background rounded-full">
            </div>
          )}
        </div>

        <div className="pt-20 px-4 sm:px-6">
          {/* Name and Username */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                {user.name}
              </h1>
              {user.isVerified && (
                <Badge variant="secondary" className="px-1.5 py-0.5 text-xs">
                  <Check className="h-3 w-3" />
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowEditProfile(true)}
                className="h-8 w-8 hover:bg-muted/50"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground mb-3">
              <span className="font-bold text-foreground">{(realtimeStats?.followers ?? user.stats.followers).toLocaleString()}</span> followers • <span className="font-bold text-foreground">{(realtimeStats?.following ?? user.stats.following).toLocaleString()}</span> following
            </p>
          </div>

          {/* Bio */}
          <div className="mb-6">
            <p className="text-foreground leading-relaxed mb-2 whitespace-pre-wrap break-words" dir="auto">
              <BioRichTextRenderer text={displayBio} />
            </p>
            {shouldTruncateBio && (
              <button
                onClick={() => setShowFullBio(!showFullBio)}
                className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors duration-150 min-h-[40px] p-2 -m-2"
              >
                {showFullBio ? (
                  <>
                    Show less <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Location, Join Date, and Links */}
          <div className="space-y-3 mb-6 text-muted-foreground">
            <div className="flex flex-wrap gap-4">
              {user.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{user.location}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{formatJoinedDate(user.joinedDate)}</span>
              </div>
            </div>
            
            {/* Links section on new line */}
            {user.website && (
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                {(() => {
                  // Handle multiple links case - support both string and array
                  const links = Array.isArray(user.website) ? user.website : [user.website];
                  const firstLink = links[0];
                  
                  if (!firstLink) return null;
                  
                  const displayLink = firstLink.replace(/^https?:\/\//, '');
                  
                  if (links.length === 1) {
                    return (
                      <a 
                        href={firstLink} 
                        className="font-bold hover:text-primary transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {displayLink}
                      </a>
                    );
                  } else {
                    return (
                      <button
                        onClick={() => setShowLinksModal(true)}
                        className="font-bold hover:text-primary transition-colors text-left"
                      >
                        {displayLink}... and {links.length - 1} more
                      </button>
                    );
                  }
                })()}
              </div>
            )}
          </div>

          {/* Wallet, Message, and Expert buttons */}
          <div className="flex gap-3 mb-8">
            <Button
              onClick={() => setShowWallet(true)}
              variant="default"
              className="flex-1 h-12 font-medium transition-all duration-200"
            >
              <Wallet className="w-4 h-4 mr-2" />
              Wallet
            </Button>
            <Button 
              variant="outline" 
              onClick={onMessageClick}
              className="flex-1 h-12 font-medium"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Message
            </Button>
          </div>

        {/* Clear Tabs: Posts | Videos | Saved */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-4 sm:px-6">
            <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 rounded-xl mb-6 h-12">
              <TabsTrigger 
                value="posts" 
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all font-medium min-h-[40px]"
              >
                Posts
              </TabsTrigger>
              <TabsTrigger 
                value="videos" 
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all font-medium min-h-[40px]"
              >
                Videos
              </TabsTrigger>
              <TabsTrigger 
                value="saved" 
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all font-medium min-h-[40px]"
              >
                Saved
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Posts Tab */}
          <TabsContent value="posts">
            {userPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 px-4 sm:px-6">
                {userPosts.map((post) => <PostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="px-4 sm:px-6">
                <EmptyState
                  icon={MessageCircle}
                  title="No posts yet"
                  description="Share your thoughts and experiences with the community"
                  ctaText="Create first post"
                  onCtaClick={() => {}}
                />
              </div>
            )}
          </TabsContent>

          {/* Videos Tab */}
          <TabsContent value="videos">
            {userVideos.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5 px-4 sm:px-6">
                {userVideos.map((video) => <VideoCard key={video.id} video={video} />)}
              </div>
            ) : (
              <div className="px-4 sm:px-6">
                <EmptyState
                  icon={VideoIcon}
                  title="No videos yet"
                  description="Create engaging video content to connect with your audience"
                  ctaText="Upload first video"
                  onCtaClick={() => {}}
                />
              </div>
            )}
          </TabsContent>

          {/* Saved Tab */}
          <TabsContent value="saved">
            {savedLoading ? (
              <div className="px-4 sm:px-6">
                <PostCardSkeleton />
                <PostCardSkeleton />
              </div>
            ) : savedPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 px-4 sm:px-6">
                {savedPosts.map((post) => <PostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="px-4 sm:px-6">
                <EmptyState
                  icon={Bookmark}
                  title="No saved content"
                  description="Save posts and videos to view them later"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
    
    {/* Links Modal */}
    <LinksModal />
    
    {/* Edit Profile Modal */}
    <EditProfileModal 
      isOpen={showEditProfile} 
      onClose={() => setShowEditProfile(false)} 
    />
    
    {/* Wallet Modal */}
    <WalletModal 
      isOpen={showWallet} 
      onClose={() => setShowWallet(false)} 
    />

    {/* Expert Verification Modal */}
    {user?.id && (
      <ExpertVerificationModal
        open={showExpertModal}
        onClose={() => setShowExpertModal(false)}
        userId={user.id}
      />
    )}
  </div>
  );
};

export default UserProfile;
