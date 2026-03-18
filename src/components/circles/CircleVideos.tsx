import React, { useState } from 'react';
import { useCircleVideos, CircleVideo } from '@/hooks/useCircleVideos';
import { useVideoPlaylists } from '@/hooks/useVideoPlaylists';
import CircleVideoCard from './CircleVideoCard';
import CircleVideoPlayer from './CircleVideoPlayer';
import CircleVideoComposer from './CircleVideoComposer';
import { Button } from '@/components/ui/button';
import { Plus, Play, ListVideo, Film, ChevronRight, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CircleVideosProps {
  circle: any;
  isOwner: boolean;
}

const CircleVideos: React.FC<CircleVideosProps> = ({ circle, isOwner }) => {
  const { data: videos, isLoading, unlockVideo } = useCircleVideos(circle.id);
  const { data: playlists } = useVideoPlaylists(circle.id);
  
  const [selectedVideo, setSelectedVideo] = useState<CircleVideo | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const filteredVideos = videos?.filter(v => {
    const matchesSearch = v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         v.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlaylist = !activePlaylistId || v.playlist_id === activePlaylistId;
    return matchesSearch && matchesPlaylist;
  });

  const handleUnlock = async (video: CircleVideo) => {
    try {
      await unlockVideo.mutateAsync(video.id);
    } catch (error) {
      console.error('Unlock failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="size-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading videos...</p>
      </div>
    );
  }

  return (
    <div className="py-6 px-4 space-y-8 animate-in fade-in duration-500">
      {/* Header Actions */}
      <div className="flex flex-col gap-4 sticky top-0 bg-background/80 backdrop-blur-md z-10 py-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Film className="size-5 text-primary" />
              Circle Videos
            </h2>
            <p className="text-xs text-muted-foreground">{videos?.length || 0} landscape videos available</p>
          </div>
          {isOwner && (
            <Button 
              size="sm" 
              className="rounded-full gap-2 bg-primary hover:bg-primary/90 shadow-lg px-4"
              onClick={() => setIsComposerOpen(true)}
            >
              <Plus className="size-4" />
              Add Video
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input 
            placeholder="Search videos..." 
            className="pl-9 h-11 bg-zinc-50 border-none rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Playlists Horizontal Scroll */}
      {playlists && playlists.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ListVideo className="size-4" />
              Playlists
            </h3>
            <Button variant="ghost" size="sm" className="text-xs text-primary font-bold">
              View All <ChevronRight className="size-3 ml-1" />
            </Button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
            <button 
              className={cn(
                "flex-shrink-0 px-6 py-2.5 rounded-full text-sm font-bold transition-all border",
                !activePlaylistId 
                  ? "bg-primary text-white border-primary shadow-md scale-105" 
                  : "bg-white text-zinc-500 border-zinc-100 hover:border-primary/30"
              )}
              onClick={() => setActivePlaylistId(null)}
            >
              All Videos
            </button>
            {playlists.map(playlist => (
              <button 
                key={playlist.id}
                className={cn(
                  "flex-shrink-0 px-6 py-2.5 rounded-full text-sm font-bold transition-all border whitespace-nowrap",
                  activePlaylistId === playlist.id
                    ? "bg-primary text-white border-primary shadow-md scale-105" 
                    : "bg-white text-zinc-500 border-zinc-100 hover:border-primary/30"
                )}
                onClick={() => setActivePlaylistId(playlist.id)}
              >
                {playlist.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Videos Grid */}
      <section className="space-y-4">
        {filteredVideos && filteredVideos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredVideos.map(video => (
              <CircleVideoCard 
                key={video.id} 
                video={video} 
                onClick={setSelectedVideo}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-100">
            <div className="p-4 rounded-full bg-white shadow-sm">
              <Film className="size-10 text-muted-foreground/30" />
            </div>
            <div>
              <p className="text-lg font-bold text-zinc-600">No videos found</p>
              <p className="text-sm text-muted-foreground max-w-[200px]">
                {activePlaylistId ? 'This playlist has no videos yet.' : 'The owner hasn\'t uploaded any videos yet.'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Video Player Overlay */}
      {selectedVideo && (
        <CircleVideoPlayer 
          video={selectedVideo} 
          onClose={() => setSelectedVideo(null)}
          onUnlock={handleUnlock}
          onNext={() => {
            const index = videos?.findIndex(v => v.id === selectedVideo.id);
            if (index !== undefined && videos && index < videos.length - 1) {
              setSelectedVideo(videos[index + 1]);
            }
          }}
          onPrevious={() => {
            const index = videos?.findIndex(v => v.id === selectedVideo.id);
            if (index !== undefined && videos && index > 0) {
              setSelectedVideo(videos[index - 1]);
            }
          }}
        />
      )}

      {/* Upload Composer Modal */}
      <CircleVideoComposer 
        circleId={circle.id}
        isOpen={isComposerOpen}
        onOpenChange={setIsComposerOpen}
      />
    </div>
  );
};

export default CircleVideos;
