import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Story } from '@/data/mock';
import StoryViewer from './StoryViewer';
import CreateStoryModal from './CreateStoryModal';
import WebRTCLiveViewer from './live/WebRTCLiveViewer';
import { useUser } from '@/contexts/UserContext';
import { useStoryPersistence } from '@/hooks/useStoryPersistence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const StoriesBar: React.FC = () => {
  const { user } = useUser();
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [isCreateStoryOpen, setIsCreateStoryOpen] = useState(false);
  const [isLiveViewerOpen, setIsLiveViewerOpen] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [selectedLiveStreamId, setSelectedLiveStreamId] = useState<string | null>(null);
  const [stories, refreshStories, isLoading] = useStoryPersistence();

  const handleStoryClick = (story: Story, index: number) => {
    if ((story as any).isLive && (story as any).liveStreamId) {
      setSelectedLiveStreamId((story as any).liveStreamId);
      setIsLiveViewerOpen(true);
      return;
    }
    if (story.isOwn && (!story.allStories || story.allStories.length === 0)) {
      setIsCreateStoryOpen(true);
      return;
    }
    setSelectedStoryIndex(index);
    setIsStoryViewerOpen(true);
  };

  const handleCreateStory = () => {
    refreshStories();
  };

  if (isLoading) return null;

  const getFirstName = (name: string) => name.split(' ')[0];

  return (
    <>
      <section aria-label="Stories" className="px-4 py-3">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide" aria-live="polite">
          {stories.map((story, index) => {
            const isOwn = story.isOwn;
            const hasStories = story.allStories && story.allStories.length > 0;
            const isLive = (story as any).isLive;
            const isViewed = story.isViewed;

            return (
              <button
                key={story.id}
                type="button"
                onClick={() => handleStoryClick(story, index)}
                className="flex flex-col items-center shrink-0 gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl transition-transform hover:scale-105"
                aria-label={isOwn && !hasStories ? "Add your story" : `View ${story.user.name}'s story`}
              >
                <div className="relative">
                  {isOwn && !hasStories ? (
                    /* Own story — dashed border */
                    <div className="size-14 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center bg-background">
                      <Avatar className="size-12">
                        <AvatarImage src={user?.avatar} alt={user?.name} />
                        <AvatarFallback
                          className="text-xs font-medium text-white"
                          style={{ backgroundColor: user?.avatarColor || '#E08ED1' }}
                        >
                          {user?.initials || 'YS'}
                        </AvatarFallback>
                      </Avatar>
                      {/* Plus badge */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsCreateStoryOpen(true); }}
                        className="absolute bottom-0 right-0 size-5 bg-primary rounded-full flex items-center justify-center border-2 border-background"
                        aria-label="Add story"
                      >
                        <Plus className="size-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    /* Other stories — segmented gradient ring */
                    <div className="relative">
                      <svg className="size-[66px]" viewBox="0 0 66 66">
                        {(() => {
                          const storyCount = story.allStories?.length || 1;
                          const radius = 31;
                          const cx = 33;
                          const cy = 33;
                          const strokeWidth = 2.5;
                          const gapAngle = storyCount > 1 ? 8 : 0; // degrees gap between segments
                          const totalGap = gapAngle * storyCount;
                          const segmentAngle = (360 - totalGap) / storyCount;
                          
                          const circumference = 2 * Math.PI * radius;
                          
                          return Array.from({ length: storyCount }).map((_, i) => {
                            const startAngle = i * (segmentAngle + gapAngle) - 90;
                            const segmentLength = (segmentAngle / 360) * circumference;
                            const dashOffset = -((startAngle + 90) / 360) * circumference;
                            
                            return (
                              <circle
                                key={i}
                                cx={cx}
                                cy={cy}
                                r={radius}
                                fill="none"
                                stroke={isLive ? '#ef4444' : isViewed ? '#9ca3af' : 'url(#storyGradient)'}
                                strokeWidth={strokeWidth}
                                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                                strokeDashoffset={dashOffset}
                                strokeLinecap="round"
                                className={isLive ? 'animate-pulse' : ''}
                              />
                            );
                          });
                        })()}
                        <defs>
                          <linearGradient id="storyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="hsl(var(--primary))" />
                            <stop offset="50%" stopColor="hsl(var(--secondary))" />
                            <stop offset="100%" stopColor="#f59e0b" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-background p-[2px] rounded-full">
                          <Avatar className="size-14">
                            <AvatarImage src={story.user.avatar} alt={story.user.name} />
                            <AvatarFallback
                              className="text-xs font-medium text-white"
                              style={{ backgroundColor: story.user.avatarColor }}
                            >
                              {story.user.initials}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LIVE badge */}
                  {isLive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border border-background">
                      LIVE
                    </div>
                  )}

                  {/* Plus for own story with existing stories */}
                  {isOwn && hasStories && !isLive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsCreateStoryOpen(true); }}
                      className="absolute bottom-0 right-0 size-5 bg-primary rounded-full flex items-center justify-center border-2 border-background"
                      aria-label="Add story"
                    >
                      <Plus className="size-3 text-white" />
                    </button>
                  )}
                </div>

                <span className="text-[11px] font-medium text-muted-foreground max-w-[64px] truncate text-center leading-tight">
                  {isOwn ? "Your Nest" : getFirstName(story.user.name)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <StoryViewer
        stories={selectedStoryIndex >= 0 && stories[selectedStoryIndex]?.allStories
          ? stories[selectedStoryIndex].allStories!
          : stories.filter(story => !story.isOwn || (story.allStories && story.allStories.length > 0))}
        initialIndex={0}
        isOpen={isStoryViewerOpen}
        onClose={() => { setIsStoryViewerOpen(false); refreshStories(); }}
      />

      <CreateStoryModal
        isOpen={isCreateStoryOpen}
        onClose={() => setIsCreateStoryOpen(false)}
        onCreateStory={handleCreateStory}
      />

      {isLiveViewerOpen && selectedLiveStreamId && (
        <WebRTCLiveViewer
          streamId={selectedLiveStreamId}
          onClose={() => {
            setIsLiveViewerOpen(false);
            setSelectedLiveStreamId(null);
          }}
        />
      )}
    </>
  );
};

export default StoriesBar;
