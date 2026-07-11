import React, { useState, useEffect, useRef } from 'react';
import PublicProfileModal from '@/components/PublicProfileModal';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, MessageCircle, Bell, MoreVertical, BadgeCheck, Pencil, Settings, Crown, Mail, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import FooterNav from '@/components/FooterNav';
import CirclePosts from '@/components/circles/CirclePosts';
import CircleServices from '@/components/circles/CircleServices';
import CircleEvents from '@/components/circles/CircleEvents';
import CircleResources from '@/components/circles/CircleResources';
import CircleMembers from '@/components/circles/CircleMembers';
import CircleAbout from '@/components/circles/CircleAbout';
import CircleMessages from '@/components/circles/CircleMessages';
import CircleVideos from '@/components/circles/CircleVideos';
import CircleActivityStrip from '@/components/circles/CircleActivityStrip';
import CircleGettingStarted from '@/components/circles/CircleGettingStarted';
import EditCircleModal from '@/components/circles/EditCircleModal';
import CircleSettingsModal from '@/components/circles/CircleSettingsModal';
import { useCircle } from '@/hooks/useCircles';
import { useCircleMutations } from '@/hooks/useCircleMutations';
import { getCircleTabs, getCircleType, getFeatureConfig } from '@/lib/circleTypes';
import { useCircleSubscription } from '@/hooks/useCircleSubscription';
import { SubscribeCircleModal } from '@/components/circles/SubscribeCircleModal';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type TabKey } from '@/hooks/useAppNav';
import { useQueryClient } from '@tanstack/react-query';
import { shareCircle } from '@/utils/shareUtils';
import { Share2 } from 'lucide-react';

interface CircleDetailProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  onTabSelect: (tab: TabKey) => void;
  onOpenCreate: () => void;
}

const CircleDetail: React.FC<CircleDetailProps> = ({
  activeTab,
  setActiveTab,
  onTabSelect,
  onOpenCreate
}) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [circleActiveTab, setCircleActiveTab] = useState(searchParams.get('tab') ?? '');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [showMiniHeader, setShowMiniHeader] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Explicit tab choices are reflected in the URL so circle sections can be
  // shared and survive back/forward navigation
  const selectTab = (tab: string) => {
    setCircleActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };
  
  const { data: circle, isLoading } = useCircle(id!, user?.id);
  const { joinCircle, leaveCircle, isJoining } = useCircleMutations();
  const { data: subscription } = useCircleSubscription(id);
  const hasSubscription = !!subscription;

  const handleEditSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['circle', id] });
  };

  // Load persisted notification preferences
  useEffect(() => {
    const loadNotifPref = async () => {
      if (!user || !id || circle?.is_owned) return;
      const { data } = await supabase
        .from('circle_notification_preferences')
        .select('enabled')
        .eq('circle_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setNotificationsEnabled(data.enabled);
    };
    loadNotifPref();
  }, [user, id, circle?.is_owned]);

  const toggleNotifications = async () => {
    if (!user || !id) return;
    const newVal = !notificationsEnabled;
    setNotificationsEnabled(newVal);
    await supabase
      .from('circle_notification_preferences')
      .upsert({ circle_id: id, user_id: user.id, enabled: newVal }, { onConflict: 'circle_id,user_id' });
    toast.success(newVal ? 'Notifications enabled' : 'Notifications disabled');
  };

  const handleJoinCircle = async () => {
    if (!user) {
      toast.error('Please log in to join circles');
      return;
    }
    if (!circle) return;

    // If subscription is required before joining, show subscribe modal
    if (circle.subscription_enabled && circle.subscription_method === 'before_join') {
      setSubscribeModalOpen(true);
      return;
    }

    try {
      await joinCircle(circle.id, user.id, circle.is_private);
    } catch (error) {
      // Error already handled in mutation
    }
  };

  const handleLeave = async () => {
    if (!user || !circle) return;
    try {
      await leaveCircle(circle.id, user.id);
      handleBack();
    } catch (error) {
      // Error already handled in mutation
    }
  };

  const handleBack = () => {
    setActiveTab('circles');
    navigate('/', { replace: true });
  };

  // Land on the first tab of the circle's type layout, and recover when the
  // active tab points at a feature this circle has disabled
  useEffect(() => {
    if (!circle) return;
    const tabs = getCircleTabs(circle);
    const valid = [
      ...tabs,
      'about',
      'members',
      ...(circle.enabled_features.includes('messages') ? ['messages'] : []),
    ];
    if (!circleActiveTab || !valid.includes(circleActiveTab)) {
      setCircleActiveTab(tabs[0] ?? 'about');
    }
  }, [circle, circleActiveTab]);

  // Compact header slides in once the banner scrolls out of view
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowMiniHeader(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [circle?.id]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full max-w-[480px] mx-auto bg-background text-foreground pb-20">
        <div className="relative">
          <Skeleton className="w-full h-48" />
          <div className="absolute top-4 left-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </div>
        </div>
        <div className="px-6 -mt-12 mb-4">
          <Skeleton className="w-24 h-24 rounded-full" />
        </div>
        <div className="px-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="min-h-[100dvh] w-full max-w-[480px] mx-auto bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Circle not found</h2>
          <Button onClick={handleBack}>Back to Circles</Button>
        </div>
      </div>
    );
  }

  const canManage = circle.is_owned || circle.is_admin || false;
  const typeConfig = getCircleType(circle.circle_type);
  const TypeIcon = typeConfig.icon;
  const circleTabs = getCircleTabs(circle);
  const mainTabs = circleTabs.slice(0, 4);
  const overflowTabs = circleTabs.slice(4);
  const messagesEnabled = circle.enabled_features.includes('messages');
  const tabsGridClass =
    ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][mainTabs.length] ??
    'grid-cols-5';

  return (
    <div className="min-h-[100dvh] w-full max-w-[480px] mx-auto bg-background text-foreground relative border-l border-r border-border pb-24">
      {/* Sticky mini-header — appears when the banner scrolls away */}
      {showMiniHeader && (
        <div className="fixed top-0 inset-x-0 z-40 animate-fade-in">
          <div className="max-w-[480px] mx-auto bg-background/95 backdrop-blur-md border-b border-x border-border flex items-center gap-2 px-3 py-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleBack} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-semibold flex-shrink-0 overflow-hidden">
              {circle.avatar_url ? (
                <img src={circle.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                circle.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <p className="font-semibold text-sm truncate flex-1">{circle.name}</p>
            {canManage ? (
              <Button size="sm" variant="outline" onClick={() => navigate(`/circle/${circle.id}/dashboard`)} aria-label="Circle dashboard">
                <BarChart3 className="h-4 w-4" />
              </Button>
            ) : !circle.is_joined ? (
              circle.is_pending ? (
                <Button size="sm" variant="outline" disabled>Requested</Button>
              ) : (
                <Button size="sm" onClick={handleJoinCircle} disabled={isJoining}>Join</Button>
              )
            ) : circle.subscription_enabled && !hasSubscription ? (
              <Button size="sm" onClick={() => setSubscribeModalOpen(true)}>
                <Crown className="h-3.5 w-3.5 mr-1" />
                Subscribe
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* Header with Banner and Profile */}
      <div className="relative">
        {/* Banner Background */}
        <div ref={bannerRef} className="h-48 overflow-hidden relative">
          {circle.cover_image_url ? (
            <img
              src={circle.cover_image_url}
              alt={circle.name}
              onLoad={() => setBannerLoaded(true)}
              className={`w-full h-full object-cover transition-opacity duration-500 ${bannerLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          {/* Back Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack} 
            className="absolute top-4 left-4 bg-black/20 backdrop-blur-sm text-white hover:bg-black/40 z-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* More Options Button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="absolute top-4 right-4 bg-black/20 backdrop-blur-sm text-white hover:bg-black/40 z-10">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage ? (
                // Owner options
                circle.subscription_enabled ? (
                  <DropdownMenuItem onClick={() => setSettingsModalOpen(true)}>
                    <Users className="h-4 w-4 mr-2" />
                    Check out your subscribers
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setSettingsModalOpen(true)}>
                    <Crown className="h-4 w-4 mr-2" />
                    Make it paid
                  </DropdownMenuItem>
                )
              ) : !circle.is_joined ? (
                // Non-member
                circle.is_pending ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    Join request pending
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleJoinCircle}>
                    Join the circle for more
                  </DropdownMenuItem>
                )
              ) : hasSubscription ? (
                <DropdownMenuItem 
                  onClick={async () => {
                    if (!user || !id) return;
                    const { error } = await supabase
                      .from('circle_subscriptions')
                      .update({ status: 'cancelled' })
                      .eq('circle_id', id)
                      .eq('user_id', user.id)
                      .eq('status', 'active');
                    if (!error) {
                      queryClient.invalidateQueries({ queryKey: ['circle-subscription', id] });
                      toast.success('Subscription cancelled');
                    } else {
                      toast.error('Failed to cancel subscription');
                    }
                  }}
                  className="text-destructive"
                >
                  Unsubscribe
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No subscription
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => circle && shareCircle(circle.id, circle.name)}>
                <Share2 className="h-4 w-4 mr-2" />
                Share Circle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Profile Image - Centered and Overlapping */}
        <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2 top-48">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white text-2xl font-bold border-4 border-background shadow-lg">
            {circle.avatar_url ? (
              <img src={circle.avatar_url} alt={circle.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              circle.name.slice(0, 2).toUpperCase()
            )}
          </div>
        </div>
      </div>

      {/* Profile Info Section */}
      <div className="pt-14 px-6 pb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">{circle.name}</h1>
          {circle.is_premium && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <BadgeCheck className="size-6 text-secondary animate-scale-in cursor-pointer" aria-label="Verified account" />
                </TooltipTrigger>
                <TooltipContent><p>Verified account</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className="text-muted-foreground mb-3 leading-relaxed">{circle.description}</p>

        {/* Type + pricing badges */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <Badge variant="outline" className="text-badge gap-1">
            <TypeIcon className="h-3 w-3" />
            {typeConfig.label}
          </Badge>
          {circle.subscription_enabled ? (
            <Badge variant="secondary" className="text-badge gap-1">
              <Crown className="h-3 w-3" />
              Paid
            </Badge>
          ) : (
            <Badge variant="outline" className="text-badge">Free</Badge>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 text-sm mb-4">
          <button
            className="flex items-center gap-1 hover:text-primary transition-colors"
            onClick={() => selectTab('members')}
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{circle.members_count?.toLocaleString() || 0} members</span>
          </button>
          {circle.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-foreground">{circle.location}</span>
            </div>
          )}
        </div>

        {/* Subscribe CTA — lives in the bio for joined members and hides once subscribed */}
        {!canManage && circle.is_joined && circle.subscription_enabled && !hasSubscription && (
          <Button
            variant="default"
            onClick={() => setSubscribeModalOpen(true)}
            className="w-full"
          >
            <Crown className="h-4 w-4 mr-1.5" />
            Subscribe
          </Button>
        )}
      </div>

      {/* Creator Section */}
      <div className="px-6 py-4 border-t border-border">
        <div className="flex items-center justify-between gap-3">
          <button 
            className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
            onClick={() => setProfileModalUserId(circle.creator_id)}
          >
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {circle.creator?.avatar_url ? (
                <img src={circle.creator.avatar_url} alt={circle.creator.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                circle.creator?.name?.slice(0, 2).toUpperCase() || 'UN'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate text-sm sm:text-base">
                {circle.creator?.name || 'Unknown'}
              </p>
              <p className="text-sm text-muted-foreground">Circle Creator</p>
            </div>
          </button>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            {canManage ? (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate(`/circle/${circle.id}/dashboard`)}
                  aria-label="Circle dashboard"
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSettingsModalOpen(true)}
                  aria-label="Circle settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setEditModalOpen(true)}
                  aria-label="Edit circle"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                {circle.is_joined ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLeaveConfirmOpen(true)}
                      disabled={isJoining}
                    >
                      {isJoining ? 'Loading...' : 'Leave'}
                    </Button>
                  </>
                ) : circle.is_pending ? (
                  <Button size="sm" variant="outline" disabled>
                    Requested
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleJoinCircle}
                    disabled={isJoining}
                  >
                    {isJoining ? 'Loading...' : 'Join Circle'}
                  </Button>
                )}
                
                {circle.is_joined && (
                  <>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => shareCircle(circle.id, circle.name)}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={toggleNotifications}
                    >
                      <Bell className={`h-4 w-4 ${notificationsEnabled ? 'fill-current' : ''}`} />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Owner setup guide */}
      {canManage && (
        <CircleGettingStarted
          circle={circle}
          onEditCircle={() => setEditModalOpen(true)}
          onOpenTab={selectTab}
        />
      )}

      {/* Activity signals */}
      <CircleActivityStrip
        circle={circle}
        onOpenEvents={() => selectTab('events')}
        onOpenMembers={() => selectTab('members')}
      />

      {/* Tabs Section — only the circle's enabled features, ordered by its type */}
      <div className="border-t border-border">
        <Tabs value={circleActiveTab} onValueChange={selectTab} className="w-full">
          <div className="px-4 pt-4 flex items-center justify-between">
            <TabsList className={`grid ${tabsGridClass} h-9 flex-1 mr-2`}>
              {mainTabs.map((feature) => (
                <TabsTrigger key={feature} value={feature} className="text-xs px-1">
                  {getFeatureConfig(feature)?.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="about" className="text-xs px-1">About</TabsTrigger>
            </TabsList>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {messagesEnabled && circle.is_joined && (
                  <DropdownMenuItem onClick={() => selectTab('messages')}>
                    <Mail className="h-4 w-4 mr-2" />
                    Messages
                  </DropdownMenuItem>
                )}
                {overflowTabs.map((feature) => (
                  <DropdownMenuItem key={feature} onClick={() => selectTab(feature)}>
                    {getFeatureConfig(feature)?.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => selectTab('members')}>
                  Members
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-[400px]">
            {messagesEnabled && (
              <TabsContent value="messages" className="animate-fade-in">
                <CircleMessages circle={circle} isOwner={canManage} />
              </TabsContent>
            )}
            {circleTabs.includes('posts') && (
              <TabsContent value="posts" className="animate-fade-in">
                <CirclePosts circle={circle} isOwner={canManage} />
              </TabsContent>
            )}
            {circleTabs.includes('videos') && (
              <TabsContent value="videos" className="animate-fade-in">
                <CircleVideos circle={circle} isOwner={canManage} />
              </TabsContent>
            )}
            {circleTabs.includes('services') && (
              <TabsContent value="services" className="animate-fade-in">
                <CircleServices circle={circle} isOwner={canManage} />
              </TabsContent>
            )}
            {circleTabs.includes('events') && (
              <TabsContent value="events" className="animate-fade-in">
                <CircleEvents circle={circle} isOwner={canManage} />
              </TabsContent>
            )}
            {circleTabs.includes('resources') && (
              <TabsContent value="resources" className="animate-fade-in">
                <CircleResources circle={circle} isOwner={canManage} />
              </TabsContent>
            )}
            <TabsContent value="members" className="animate-fade-in">
              <CircleMembers circle={circle} isOwner={canManage} onViewProfile={(userId) => setProfileModalUserId(userId)} />
            </TabsContent>
            <TabsContent value="about" className="animate-fade-in">
              <CircleAbout circle={circle} onViewCreatorProfile={(userId) => setProfileModalUserId(userId)} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Footer Navigation */}
      <FooterNav active={activeTab} onSelect={onTabSelect} onOpenCreate={onOpenCreate} />

      {/* Edit Circle Modal */}
      {circle && (
        <EditCircleModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          circle={circle}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Circle Settings Modal */}
      {circle && (
        <CircleSettingsModal
          open={settingsModalOpen}
          onOpenChange={setSettingsModalOpen}
          circle={circle}
        />
      )}

      {/* Subscribe Modal */}
      {circle && (
        <SubscribeCircleModal
          isOpen={subscribeModalOpen}
          onClose={() => setSubscribeModalOpen(false)}
          circleId={circle.id}
          circleName={circle.name}
          subscriptionPrice={circle.subscription_price}
          onSubscribed={() => {
            queryClient.invalidateQueries({ queryKey: ['circle-subscription', id] });
            // If "before_join" mode, also join the circle after subscribing
            if (circle.subscription_method === 'before_join' && !circle.is_joined && user) {
              joinCircle(circle.id, user.id, circle.is_private);
            }
          }}
        />
      )}

      {/* Leave Confirmation */}
      <AlertDialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {circle.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll lose access to member-only content.
              {circle.is_private
                ? ' This is a private circle — rejoining requires a new request or invite.'
                : ' You can rejoin at any time.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Circle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Public Profile Modal */}
      {profileModalUserId && (
        <PublicProfileModal
          isOpen={!!profileModalUserId}
          onClose={() => setProfileModalUserId(null)}
          userId={profileModalUserId}
        />
      )}
    </div>
  );
};

export default CircleDetail;
