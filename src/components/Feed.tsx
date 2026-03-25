import React, { useState, useEffect, useCallback, useRef } from 'react';
import PostCard from './PostCard';
import { Post } from '@/data/mock';
import { supabase } from '@/integrations/supabase/client';
import { VideoLoader } from '@/components/ui/VideoLoader';

const PostSkeleton = () => (
  <div className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-[var(--shadow-soft)] mb-3 animate-pulse">
    <div className="px-4 pt-4 pb-3 flex items-center gap-3">
      <div className="size-10 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-28 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
    </div>
    <div className="aspect-square w-full bg-muted" />
    <div className="px-3 pt-3 pb-1 flex items-center gap-4">
      <div className="h-5 w-12 rounded bg-muted" />
      <div className="h-5 w-12 rounded bg-muted" />
      <div className="h-5 w-12 rounded bg-muted" />
      <div className="ml-auto h-5 w-5 rounded bg-muted" />
    </div>
    <div className="px-4 pt-1 pb-4 space-y-2">
      <div className="h-3.5 w-full rounded bg-muted" />
      <div className="h-3.5 w-3/4 rounded bg-muted" />
    </div>
  </div>
);

const PAGE_SIZE = 10;

const formatPost = (item: any): Post => ({
  id: item.post_id,
  user: { id: item.user_id, name: item.name, initials: item.initials, avatarColor: item.avatar_color, verified: item.is_verified, avatar: item.avatar_url },
  time: new Date(item.created_at).toISOString(),
  content: item.content,
  post_type: item.post_type?.toLowerCase() as any || undefined,
  original_pdf_url: item.original_pdf_url || undefined,
  media: (() => {
    const base = { kind: "image" as const, alt: item.media_alt || '', colorFrom: item.media_color_from || '#4B164C', colorTo: item.media_color_to || '#22194D' };
    // For PDF posts, always use urls array so PostCard's PDF check works
    const isPdf = item.post_type?.toLowerCase() === 'pdf';
    if (isPdf) {
      return { ...base, urls: item.media_urls && item.media_urls.length > 0 ? item.media_urls : [item.media_url].filter(Boolean) as string[] };
    }
    if (item.media_urls && item.media_urls.length > 1) return { ...base, urls: item.media_urls };
    if (item.cover_image_url) return { ...base, url: item.cover_image_url };
    if (item.media_url) return { ...base, url: item.media_url };
    if (item.media_urls && item.media_urls.length === 1) return { ...base, url: item.media_urls[0] };
    return undefined;
  })(),
  tags: item.tags || [],
  stats: { likes: item.likes_count || 0, comments: item.comments_count || 0, shares: item.shares_count || 0 },
  sponsored: item.is_sponsored || false,
  userHasLiked: item.user_has_liked || false,
  userReaction: item.user_reaction,
  circleId: item.circle_id || undefined,
  circleName: item.circle_name || undefined,
  circleAvatar: item.circle_avatar_url || undefined,
  isPremium: item.is_premium || false,
  voiceUrl: item.voice_url || undefined,
  locationText: item.location_text || undefined,
  totalMediaCount: item.media_urls ? item.media_urls.length : (item.cover_image_url || item.media_url ? 1 : 0),
});

const Feed: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPosts = useCallback(async (pageNum: number) => {
    try {
      const { data, error } = await supabase.rpc('get_feed_posts', { page_num: pageNum, page_size: PAGE_SIZE });
      if (error) throw error;
      const formatted = (data || []).map(formatPost);
      if (pageNum === 0) {
        setPosts(formatted);
      } else {
        setPosts(prev => [...prev, ...formatted]);
      }
      setHasMore(formatted.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchPosts(0); }, [fetchPosts]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage);
  }, [loadingMore, hasMore, page, fetchPosts]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (loading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [loading, hasMore, loadingMore, loadMore]);

  return (
    <section aria-labelledby="feed-heading" className="px-3 pt-2 pb-24">
      <h2 id="feed-heading" className="sr-only">Feed</h2>
      {loading ? (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      ) : posts.length ? (
        <>
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              {loadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <VideoLoader size="sm" />
                  <span className="text-sm">Loading more posts...</span>
                </div>
              )}
            </div>
          )}
          {!hasMore && posts.length > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground py-4">You're all caught up!</p>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        </div>
      )}
    </section>
  );
};

export default Feed;
