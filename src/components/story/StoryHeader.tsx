import React, { useState } from 'react';
import { MoreVertical, X, Trash2, EyeOff, Flag } from 'lucide-react';
import { Story, PauseReason } from '@/types/storyTypes';

interface StoryHeaderProps {
  story: Story;
  isOwnStory: boolean;
  onClose: () => void;
  onShowProfile: () => void;
  onPause: (reason: PauseReason) => void;
  onResume: (reason: PauseReason) => void;
  onDelete: () => void;
  onHide: () => void;
  onReport: () => void;
}

export const StoryHeader: React.FC<StoryHeaderProps> = ({
  story,
  isOwnStory,
  onClose,
  onShowProfile,
  onPause,
  onResume,
  onDelete,
  onHide,
  onReport,
}) => {
  const [showStoryMenu, setShowStoryMenu] = useState(false);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showStoryMenu) {
      setShowStoryMenu(false);
      onResume('menu');
    } else {
      setShowStoryMenu(true);
      onPause('menu');
    }
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShowProfile();
  };

  return (
    <>
      <div className="absolute top-7 left-3 right-3 z-30 flex items-center gap-2">
        {/* User info — left, Instagram pattern */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0" data-story-controls>
          <div
            className="size-8 rounded-full flex items-center justify-center text-white font-semibold text-[11px] overflow-hidden shrink-0 ring-2 ring-white/40 cursor-pointer"
            style={{ backgroundColor: story.user.avatarColor }}
            onClick={handleProfileClick}
          >
            {story.user.avatar ? (
              <img src={story.user.avatar} alt={story.user.name} className="w-full h-full object-cover" />
            ) : (
              story.user.initials
            )}
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <p
              className="text-white text-sm font-semibold truncate cursor-pointer hover:underline leading-tight"
              onClick={handleProfileClick}
            >
              {story.user.name}
            </p>
            <p className="text-white/70 text-xs font-normal shrink-0">
              {(() => {
                const created = story.createdAt;
                if (!created) return '';
                const diff = Date.now() - new Date(created).getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor(diff / (1000 * 60));
                if (hours >= 24) return `${Math.floor(hours / 24)}d`;
                if (hours > 0) return `${hours}h`;
                if (minutes > 0) return `${minutes}m`;
                return 'now';
              })()}
            </p>
          </div>
        </div>

        {/* Menu + Close — grouped right, Instagram pattern */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleMenuClick}
            className="story-icon-btn"
            data-story-controls
            aria-label="Story options"
          >
            <MoreVertical className="size-5" />
          </button>
          <button
            onClick={onClose}
            className="story-icon-btn"
            data-story-controls
            aria-label="Close story"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Story Menu Dropdown — aligned under the right-side menu button */}
      {showStoryMenu && (
        <>
          <div className="fixed inset-0 z-25" onPointerDown={(e) => { e.stopPropagation(); setShowStoryMenu(false); onResume('menu'); }} />
          <div className="absolute top-16 right-3 z-30 story-dropdown" data-story-controls>
            {isOwnStory ? (
              <>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); setShowStoryMenu(false); onResume('menu'); onDelete(); }}
                  className="story-dropdown-item text-red-400"
                >
                  <Trash2 className="size-4" />
                  Delete Story
                </button>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); setShowStoryMenu(false); onResume('menu'); onHide(); }}
                  className="story-dropdown-item text-white"
                >
                  <EyeOff className="size-4" />
                  Hide Story
                </button>
              </>
            ) : (
              <button
                onPointerDown={(e) => { e.stopPropagation(); setShowStoryMenu(false); onResume('menu'); onReport(); }}
                className="story-dropdown-item text-red-400"
              >
                <Flag className="size-4" />
                Report Story
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
};
