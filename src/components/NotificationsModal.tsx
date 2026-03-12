import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, MessageCircle, UserPlus, ShoppingBag, AlertTriangle, Calendar, Gift, Star, X, Check, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'order' | 'safety' | 'event' | 'reward';
  title: string;
  description: string;
  timestamp: Date;
  isRead: boolean;
  avatar?: string;
  userName?: string;
  actionText?: string;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'safety',
    title: 'Safety Alert - Your Area',
    description: 'Emergency services are responding to an incident 0.5 miles from your location. Stay safe!',
    timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
    isRead: false,
  },
  {
    id: '2',
    type: 'like',
    title: 'Sarah loved your post',
    description: 'Your post about "Healthy breakfast ideas for toddlers" received a heart',
    timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    isRead: false,
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b9d3f0b4?w=150&h=150&fit=crop&crop=face',
    userName: 'Sarah Johnson',
    actionText: 'loved your post'
  },
  {
    id: '3',
    type: 'comment',
    title: 'New comment on your post',
    description: 'Maria commented: "This is so helpful! My 2-year-old is such a picky eater"',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    isRead: false,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    userName: 'Maria Rodriguez',
    actionText: 'commented on your post'
  },
  {
    id: '4',
    type: 'follow',
    title: 'Lisa started following you',
    description: 'Lisa Chen is now following your updates',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    isRead: true,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    userName: 'Lisa Chen',
    actionText: 'started following you'
  },
  {
    id: '5',
    type: 'event',
    title: 'Playdate Reminder',
    description: 'Toddler Playgroup at Central Park is starting in 2 hours',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
    isRead: true,
  },
  {
    id: '6',
    type: 'order',
    title: 'Your order has shipped',
    description: 'Baby organic cotton onesies (3-pack) is on its way! Tracking: UPS123456',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    isRead: true,
  },
  {
    id: '7',
    type: 'reward',
    title: 'Achievement Unlocked!',
    description: 'You\'ve earned the "Community Helper" badge for helping 10+ moms this week',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    isRead: true,
  }
];

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'like': return <Heart className="h-4 w-4 text-red-500" />;
    case 'comment': return <MessageCircle className="h-4 w-4 text-primary" />;
    case 'follow': return <UserPlus className="h-4 w-4 text-secondary" />;
    case 'order': return <ShoppingBag className="h-4 w-4 text-purple-500" />;
    case 'safety': return <AlertTriangle className="h-4 w-4 text-red-600" />;
    case 'event': return <Calendar className="h-4 w-4 text-orange-500" />;
    case 'reward': return <Star className="h-4 w-4 text-yellow-500" />;
    default: return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
  }
};

const getNotificationBgColor = (type: string) => {
  switch (type) {
    case 'like': return 'bg-red-50';
    case 'comment': return 'bg-blue-50';
    case 'follow': return 'bg-green-50';
    case 'order': return 'bg-purple-50';
    case 'safety': return 'bg-red-100';
    case 'event': return 'bg-orange-50';
    case 'reward': return 'bg-yellow-50';
    default: return 'bg-gray-50';
  }
};

export const NotificationsModal: React.FC<NotificationsModalProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [activeTab, setActiveTab] = useState('all');

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filteredNotifications = notifications.filter(notification => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !notification.isRead;
    if (activeTab === 'safety') return notification.type === 'safety';
    if (activeTab === 'social') return ['like', 'comment', 'follow', 'mention'].includes(notification.type);
    return true;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              Notifications
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {unreadCount}
                </Badge>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={markAllAsRead}
                  className="text-xs"
                >
                  Mark all read
                </Button>
              )}
              <Button size="sm" variant="ghost">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4 mx-4 mt-2">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="unread" className="text-xs">Unread</TabsTrigger>
            <TabsTrigger value="safety" className="text-xs">Safety</TabsTrigger>
            <TabsTrigger value="social" className="text-xs">Social</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 overflow-auto mt-2">
            <div className="space-y-1 px-4 pb-4">
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No notifications yet</p>
                  <p className="text-sm">We'll notify you when something happens</p>
                </div>
              ) : (
                filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`relative p-2 rounded-lg hover:bg-gray-50 transition-colors border cursor-pointer ${
                      !notification.isRead ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-gray-100'
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-full flex-shrink-0 ${getNotificationBgColor(notification.type)}`}>
                        {notification.avatar ? (
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={notification.avatar} />
                            <AvatarFallback>{notification.userName?.[0]}</AvatarFallback>
                          </Avatar>
                        ) : (
                          getNotificationIcon(notification.type)
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <h4 className="font-medium text-sm text-gray-900 truncate">
                            {notification.title}
                          </h4>
                          <div className="flex items-center gap-1 ml-2">
                            {!notification.isRead && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-red-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                            >
                              <X className="h-3 w-3 text-gray-400 hover:text-red-500" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                          {notification.description}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                          </span>
                          {notification.type === 'safety' && (
                            <Badge variant="destructive" className="text-xs">
                              Urgent
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};