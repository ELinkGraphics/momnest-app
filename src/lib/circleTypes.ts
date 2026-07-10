import {
  GraduationCap,
  Users,
  Briefcase,
  Building2,
  Newspaper,
  HeartHandshake,
  Star,
  MapPin,
  MessageSquare,
  Video,
  CalendarDays,
  FolderOpen,
  Mail,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for circle types and toggleable circle features.
 * The creation wizard, circle navigation, discovery cards and edit modal all
 * read from here so a circle's layout always matches its type.
 */

export type CircleFeature = 'posts' | 'videos' | 'services' | 'events' | 'resources' | 'messages';

export interface CircleFeatureConfig {
  id: CircleFeature;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Locked features are always enabled and cannot be toggled off. */
  locked?: boolean;
}

export const CIRCLE_FEATURES: CircleFeatureConfig[] = [
  { id: 'posts', label: 'Posts', icon: MessageSquare, description: 'Discussions and updates', locked: true },
  { id: 'videos', label: 'Videos', icon: Video, description: 'Video lessons and playlists' },
  { id: 'resources', label: 'Resources', icon: FolderOpen, description: 'Files, guides and downloads' },
  { id: 'events', label: 'Events', icon: CalendarDays, description: 'Live classes and meetups' },
  { id: 'services', label: 'Services', icon: Briefcase, description: 'Bookable sessions and services' },
  { id: 'messages', label: 'Messages', icon: Mail, description: 'Member chat room' },
];

/** Every feature, in default order — used for existing circles with no explicit selection. */
export const DEFAULT_FEATURES: CircleFeature[] = CIRCLE_FEATURES.map((f) => f.id);

/** Content features that can appear as main tabs (messages stays in the overflow menu). */
export const TAB_FEATURES: CircleFeature[] = ['posts', 'videos', 'services', 'events', 'resources'];

export type CircleTypeId =
  | 'learning'
  | 'community'
  | 'consulting'
  | 'business'
  | 'news'
  | 'support_group'
  | 'creator_club'
  | 'local_community';

export interface CircleTypeConfig {
  id: CircleTypeId;
  label: string;
  tagline: string;
  icon: LucideIcon;
  /** Features pre-enabled when a creator picks this type. */
  defaultFeatures: CircleFeature[];
  /** Preferred order of the main tabs; enabled features missing here are appended. */
  tabOrder: CircleFeature[];
}

export const CIRCLE_TYPES: CircleTypeConfig[] = [
  {
    id: 'learning',
    label: 'Learning',
    tagline: 'Teach with videos, resources and live classes',
    icon: GraduationCap,
    defaultFeatures: ['posts', 'videos', 'resources', 'events'],
    tabOrder: ['videos', 'resources', 'events', 'posts', 'services'],
  },
  {
    id: 'community',
    label: 'Community',
    tagline: 'Bring people together around a shared interest',
    icon: Users,
    defaultFeatures: ['posts', 'events', 'messages'],
    tabOrder: ['posts', 'events', 'videos', 'resources', 'services'],
  },
  {
    id: 'consulting',
    label: 'Consulting',
    tagline: 'Offer bookable sessions and expert advice',
    icon: Briefcase,
    defaultFeatures: ['posts', 'services', 'events', 'resources'],
    tabOrder: ['services', 'posts', 'events', 'resources', 'videos'],
  },
  {
    id: 'business',
    label: 'Business',
    tagline: 'Grow an audience around your brand',
    icon: Building2,
    defaultFeatures: ['posts', 'services', 'videos', 'events'],
    tabOrder: ['posts', 'services', 'videos', 'events', 'resources'],
  },
  {
    id: 'news',
    label: 'News',
    tagline: 'Publish updates your members can follow',
    icon: Newspaper,
    defaultFeatures: ['posts', 'videos'],
    tabOrder: ['posts', 'videos', 'resources', 'events', 'services'],
  },
  {
    id: 'support_group',
    label: 'Support Group',
    tagline: 'A safe space for members to support each other',
    icon: HeartHandshake,
    defaultFeatures: ['posts', 'messages', 'events', 'resources'],
    tabOrder: ['posts', 'events', 'resources', 'videos', 'services'],
  },
  {
    id: 'creator_club',
    label: 'Creator Club',
    tagline: 'Exclusive content for your fans and supporters',
    icon: Star,
    defaultFeatures: ['posts', 'videos', 'events', 'messages'],
    tabOrder: ['posts', 'videos', 'events', 'resources', 'services'],
  },
  {
    id: 'local_community',
    label: 'Local Community',
    tagline: 'Meet and organize with people near you',
    icon: MapPin,
    defaultFeatures: ['posts', 'events', 'messages'],
    tabOrder: ['events', 'posts', 'resources', 'videos', 'services'],
  },
];

export const CIRCLE_CATEGORIES = [
  'Community',
  'Sports',
  'Education',
  'Technology',
  'Art & Design',
  'Music',
  'Business',
  'Health & Wellness',
  'Travel',
  'Food & Cooking',
  'Gaming',
  'Other',
];

export const getCircleType = (id?: string | null): CircleTypeConfig =>
  CIRCLE_TYPES.find((t) => t.id === id) ?? CIRCLE_TYPES.find((t) => t.id === 'community')!;

export const getFeatureConfig = (id: string): CircleFeatureConfig | undefined =>
  CIRCLE_FEATURES.find((f) => f.id === id);

/** Normalize a stored feature list: known ids only, locked features always included. */
export const normalizeFeatures = (features?: string[] | null): CircleFeature[] => {
  const valid = (features ?? DEFAULT_FEATURES).filter((f): f is CircleFeature =>
    CIRCLE_FEATURES.some((c) => c.id === f)
  );
  const withLocked = CIRCLE_FEATURES.filter((f) => f.locked).map((f) => f.id);
  return [...new Set([...withLocked, ...valid])];
};

/**
 * The main tabs for a circle: its enabled content features in the order its
 * type prefers. Messages/members/about are handled separately by the page.
 */
export const getCircleTabs = (circle: {
  circle_type?: string | null;
  enabled_features?: string[] | null;
}): CircleFeature[] => {
  const type = getCircleType(circle.circle_type);
  const enabled = normalizeFeatures(circle.enabled_features);
  const ordered = type.tabOrder.filter((f) => enabled.includes(f) && TAB_FEATURES.includes(f));
  const missing = enabled.filter((f) => TAB_FEATURES.includes(f) && !ordered.includes(f));
  return [...ordered, ...missing];
};
