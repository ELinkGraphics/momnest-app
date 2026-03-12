import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, Calendar, FileText, Settings, MessageCircle, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import FooterNav from '@/components/FooterNav';
import CirclePosts from './CirclePosts';
import CircleServices from './CircleServices';
import CircleEvents from './CircleEvents';
import CircleResources from './CircleResources';
import CircleMembers from './CircleMembers';
import CircleAbout from './CircleAbout';
import { type TabKey } from '@/hooks/useAppNav';

interface CircleDetailModalProps {
  circle: any;
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabKey;
  onTabSelect: (tab: TabKey) => void;
  onOpenCreate: () => void;
}

const CircleDetailModal: React.FC<CircleDetailModalProps> = ({ 
  circle, 
  isOpen, 
  onClose, 
  activeTab: navActiveTab, 
  onTabSelect, 
  onOpenCreate 
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('posts');

  const handleBackClick = () => {
    navigate('/circles');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
      <div className="fixed inset-x-0 bottom-0 top-16 bg-background rounded-t-xl overflow-hidden">
        {/* Header */}
        <div className="relative">
          {/* Cover Image */}
          <div className="h-48 overflow-hidden">
            <img 
              src={circle.coverImage} 
              alt={circle.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>

          {/* Back Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackClick}
            className="absolute top-4 left-4 bg-black/20 backdrop-blur-sm text-white hover:bg-black/40"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* Circle Info */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white text-xl font-bold border-4 border-background">
                {circle.name.slice(0, 2).toUpperCase()}
              </div>
              
              <div className="flex-1 text-white">
                <h1 className="text-2xl font-bold mb-1">{circle.name}</h1>
                <div className="flex items-center gap-4 text-sm opacity-90">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{circle.members.toLocaleString()} members</span>
                  </div>
                  {circle.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{circle.location}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="icon" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <MessageCircle className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Creator Profile */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
              {circle.creator.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="font-medium text-foreground">{circle.creator.name}</p>
                {circle.isPremium && (
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
              <p className="text-sm text-muted-foreground">Circle Creator</p>
            </div>
            <div className="ml-auto flex gap-2">
              {circle.isPremium && (
                <Badge variant="default">Premium</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden pb-24">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid grid-cols-6 mx-6 mt-4">
              <TabsTrigger value="posts" className="text-xs">Posts</TabsTrigger>
              <TabsTrigger value="services" className="text-xs">Services</TabsTrigger>
              <TabsTrigger value="events" className="text-xs">Events</TabsTrigger>
              <TabsTrigger value="resources" className="text-xs">Resources</TabsTrigger>
              <TabsTrigger value="members" className="text-xs">Members</TabsTrigger>
              <TabsTrigger value="about" className="text-xs">About</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="posts">
                <CirclePosts circle={circle} isOwner={false} />
              </TabsContent>
              <TabsContent value="services">
                <CircleServices circle={circle} isOwner={false} />
              </TabsContent>
              <TabsContent value="events">
                <CircleEvents circle={circle} isOwner={false} />
              </TabsContent>
              <TabsContent value="resources">
                <CircleResources circle={circle} isOwner={false} />
              </TabsContent>
              <TabsContent value="members">
                <CircleMembers circle={circle} isOwner={false} />
              </TabsContent>
              <TabsContent value="about">
                <CircleAbout circle={circle} />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Footer Navigation */}
        <div className="absolute bottom-0 left-0 right-0">
          <FooterNav
            active={navActiveTab}
            onSelect={onTabSelect}
            onOpenCreate={onOpenCreate}
          />
        </div>
      </div>
    </div>
  );
};

export default CircleDetailModal;