export interface StoryUser {
  id?: string;
  name: string;
  initials: string;
  avatarColor: string;
  avatar?: string;
  username?: string;
  verified?: boolean;
}

export interface StoryFilter {
  id: string;
  name: string;
  css: string;
  canvasFilter?: string; // Phase 2 addition for export support
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  bgColor: string;
}

// Canonical Sticker Item type (merges StoryStickerData and StickerItem)
export interface StoryStickerData {
  id?: string;
  type: 'emoji' | 'info' | 'overlay' | 'video_transform' | 'background_gradient';
  content: string;
  infoType?: 'location' | 'hashtag' | 'mention' | 'link';
  mentionUserId?: string;
  x?: number;
  y?: number;
  // Extra fields for specific types
  scale?: number;
  rotation?: number;
  canvasW?: number;
  canvasH?: number;
  from?: string;
  to?: string;
}

export interface Story {
  id: number | string;
  user: StoryUser;
  image: string;
  mediaType?: 'image' | 'video';
  overlayUrl?: string;
  videoTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    canvasW: number;
    canvasH: number;
  };
  backgroundGradient?: {
    from: string;
    to: string;
  };
  isOwn?: boolean;
  isViewed?: boolean;
  isLive?: boolean;
  liveStreamId?: string;
  allStories?: Story[];
  stickerData?: StoryStickerData[];
  resharedPostId?: string;
  createdAt?: string;
  originalIndex?: number; // Phase 1 addition for navigation tracking
}

export interface StoryMention {
  user_id: string;
  username: string;
  name: string;
}

export interface StoryMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  profile?: {
    name: string;
    initials: string;
    avatar_color: string;
    avatar_url: string | null;
  };
}

export interface EditorExtraData {
  mediaType: 'image' | 'video';
  overlayUrl?: string;
  videoTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    canvasW: number;
    canvasH: number;
  };
  backgroundGradient?: {
    from: string;
    to: string;
  };
}

export type PauseReason = 'hold' | 'menu' | 'input' | 'activity' | 'visibility' | 'link-overlay' | 'profile' | 'emoji-picker';
