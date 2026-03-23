import React from 'react';
import { MapPin, Users, Crown, Lock, TrendingUp, BadgeCheck, Shield, Share2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Circle } from '@/hooks/useCircles';
import { shareCircle } from '@/utils/shareUtils';

interface CircleCardProps {
  circle: Circle;
  onClick: () => void;
  showManageButton?: boolean;
  onManage?: () => void;
  onJoin?: (circleId: string, isPrivate: boolean) => void;
  isJoining?: boolean;
}

const CircleCard: React.FC<CircleCardProps> = ({ circle, onClick, showManageButton, onManage, onJoin, isJoining }) => {
  const handleJoinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onJoin?.(circle.id, !!circle.is_private);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    shareCircle(circle.id, circle.name);
  };

  return (
    <Card 
      className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-card/50 backdrop-blur-sm border-border/50"
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="relative h-32 overflow-hidden rounded-t-lg">
        {circle.cover_image_url ? (
          <img 
            src={circle.cover_image_url} 
            alt={circle.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Badges */}
        <div className="absolute top-3 right-3 flex gap-2">
          {circle.is_admin && !circle.is_owned && (
            <Badge variant="default" className="bg-primary/90 text-primary-foreground">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          )}
          {circle.is_owned && (
            <Badge variant="default" className="bg-primary/90 text-primary-foreground">
              <Crown className="h-3 w-3 mr-1" />
              Owner
            </Badge>
          )}
          {circle.is_premium && (
            <Badge variant="default" className="bg-gradient-secondary text-primary-foreground shadow-glow">
              <Crown className="h-3 w-3 mr-1" />
              Premium
            </Badge>
          )}
          {circle.is_private && (
            <Badge variant="secondary" className="bg-secondary/20 text-secondary border-secondary/30">
              <Lock className="h-3 w-3 mr-1" />
              Private
            </Badge>
          )}
        </div>

        {/* Avatar */}
        <div className="absolute bottom-3 left-3">
          <div className="h-12 w-12 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-sm font-semibold border-2 border-background shadow-glow">
            {circle.avatar_url ? (
              <img src={circle.avatar_url} alt={circle.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              circle.name.slice(0, 2).toUpperCase()
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {circle.name}
            </h3>
            <div className="flex items-center gap-1">
              <p className="text-username text-muted-foreground">by {circle.creator?.name || 'Unknown'}</p>
              {circle.is_premium && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <BadgeCheck className="size-4 text-secondary animate-scale-in cursor-pointer" aria-label="Verified account" />
                    </TooltipTrigger>
                    <TooltipContent><p>Verified account</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          {circle.is_active && (
            <div className="flex items-center gap-1 text-green-500">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs">Active</span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-post-content text-muted-foreground mb-3 line-clamp-2">
          {circle.description}
        </p>

        {/* Meta Info */}
        <div className="flex items-center gap-4 mb-3 text-meta-info text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{circle.members_count?.toLocaleString() || 0}</span>
          </div>
          {circle.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{circle.location}</span>
            </div>
          )}
        </div>

        {/* Category */}
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-badge">
            {circle.category}
          </Badge>
          
          {/* Action Button */}
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
            {showManageButton ? (
              <Button variant="outline" size="sm" onClick={onManage}>
                Manage
              </Button>
            ) : circle.is_joined ? (
              <>
                <Button variant="outline" size="sm" disabled className="bg-muted text-muted-foreground border-border cursor-not-allowed opacity-70">
                  Joined
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button 
                size="sm" 
                onClick={handleJoinClick}
                disabled={isJoining}
                className={circle.is_premium ? "bg-gradient-primary text-primary-foreground hover:bg-gradient-primary/90 shadow-glow" : ""}
              >
                {isJoining ? 'Joining...' : circle.is_premium ? 'Subscribe' : 'Join'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>

  );
};

export default CircleCard;
