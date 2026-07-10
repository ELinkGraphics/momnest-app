import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CircleEmptyStateProps {
  icon: LucideIcon;
  /** What members see, e.g. "No videos yet" */
  title: string;
  description?: string;
  /** What the creator sees instead, e.g. "Upload your first video" */
  ownerTitle?: string;
  ownerDescription?: string;
  isOwner: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shared empty state for circle tabs. Creators get an action prompt instead
 * of a dead end ("Upload your first video" vs "No videos yet").
 */
const CircleEmptyState: React.FC<CircleEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  ownerTitle,
  ownerDescription,
  isOwner,
  actionLabel,
  onAction,
}) => {
  const heading = isOwner && ownerTitle ? ownerTitle : title;
  const subtext = isOwner && ownerDescription ? ownerDescription : description;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4">
      <div className="p-4 rounded-full bg-primary/10">
        <Icon className="size-8 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{heading}</p>
        {subtext && <p className="text-sm text-muted-foreground max-w-[260px]">{subtext}</p>}
      </div>
      {isOwner && actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default CircleEmptyState;
