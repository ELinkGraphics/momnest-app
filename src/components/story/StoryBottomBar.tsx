import React, { useState, useEffect } from 'react';
import { Heart, Send, BarChart3, Repeat2, Loader2, ChevronUp } from 'lucide-react';
import EmojiPicker from '@/components/EmojiPicker';
import { StoryMention, PauseReason } from '@/types/storyTypes';

interface StoryBottomBarProps {
  isOwnStory: boolean;
  storyDbId: string | null;
  isLiked: boolean;
  isLikeLoading: boolean;
  onLikeToggle: () => void;
  isResharing: boolean;
  isMentionedInStory: boolean;
  onReshare: () => void;
  onSendMessage: (msg: string) => void;
  onShowActivity: () => void;
  onPause: (reason: PauseReason) => void;
  onResume: (reason: PauseReason) => void;
  storyMentions: StoryMention[];
  onMentionClick: (userId: string) => void;
}

export const StoryBottomBar: React.FC<StoryBottomBarProps> = ({
  isOwnStory,
  storyDbId,
  isLiked,
  isLikeLoading,
  onLikeToggle,
  isResharing,
  isMentionedInStory,
  onReshare,
  onSendMessage,
  onShowActivity,
  onPause,
  onResume,
  storyMentions,
  onMentionClick,
}) => {
  const [message, setMessage] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // The reply box is "engaged" while the user is focused on it, the emoji picker
  // is open, or there's a draft message. Playback stays paused for that whole
  // window — so transient blurs (opening the emoji picker, the keyboard hiding)
  // don't resume the story. Once everything clears (e.g. after sending), we resume.
  const replyEngaged = inputFocused || emojiOpen || message.trim().length > 0;

  useEffect(() => {
    if (replyEngaged) {
      onPause('input');
      return;
    }
    // Debounce so flipping focus → emoji picker doesn't briefly resume in between.
    const t = setTimeout(() => onResume('input'), 120);
    return () => clearTimeout(t);
  }, [replyEngaged, onPause, onResume]);

  // Safety: always release the input pause if the bar unmounts (e.g. viewer closed).
  useEffect(() => {
    return () => onResume('input');
  }, [onResume]);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    onSendMessage(message.trim());
    setMessage('');
    setInputFocused(false);
    setEmojiOpen(false);
  };

  return (
    <>
      {/* Mentions Tags */}
      <div className="absolute bottom-20 left-3 right-3 z-10">
        {storyMentions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {storyMentions.map(mention => (
              <button
                key={mention.user_id}
                onClick={(e) => {
                  e.stopPropagation();
                  onMentionClick(mention.user_id);
                }}
                className="story-mention-tag"
                data-story-controls
              >
                @{mention.username}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Bottom Bar */}
      {!isOwnStory ? (
        <div className="absolute bottom-3 left-3 right-3 z-[50] flex items-center gap-2" data-story-controls>
          {/* Like button */}
          <button
            onClick={onLikeToggle}
            disabled={isLikeLoading}
            className="story-action-btn shrink-0"
            aria-label={isLiked ? "Unlike story" : "Like story"}
          >
            <Heart 
              className={`size-6 transition-all duration-200 ${
                isLiked 
                  ? 'fill-red-500 text-red-500 scale-110' 
                  : 'text-white'
              }`}
            />
          </button>

          {/* Reshare button */}
          {isMentionedInStory && (
            <button
              onClick={onReshare}
              disabled={isResharing}
              className="story-action-btn shrink-0"
              aria-label="Reshare to your story"
            >
              {isResharing ? (
                <Loader2 className="size-5 text-white animate-spin" />
              ) : (
                <Repeat2 className="size-5 text-white" />
              )}
            </button>
          )}

          {/* Message input */}
          <div className="story-message-input flex-1">
            <EmojiPicker
              onEmojiSelect={(emoji) => setMessage(prev => prev + emoji)}
              onOpenChange={setEmojiOpen}
              variant="compact"
              triggerClassName="text-white/60 hover:text-white hover:bg-white/10"
              className="z-[200]"
            />
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Send message..."
              className="flex-1 bg-transparent text-white placeholder:text-white/50 outline-none text-sm"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            {message && (
              <button
                onClick={handleSendMessage}
                className="text-white hover:text-white/80 transition-colors shrink-0 px-2"
                aria-label="Send message"
              >
                <Send className="size-5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Activity button - only for story owner */
        storyDbId && (
          <div className="absolute bottom-3 left-3 right-3 z-[50] flex justify-center" data-story-controls>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowActivity();
              }}
              className="story-activity-btn"
            >
              <ChevronUp className="size-4" />
              <BarChart3 className="size-4" />
              <span className="text-sm font-medium">Activity</span>
            </button>
          </div>
        )
      )}
    </>
  );
};
