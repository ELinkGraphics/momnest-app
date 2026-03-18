import React, { useState } from 'react';
import { Home, Users, Plus, Camera, UserPlus, Radio, HeartHandshake, Edit3, Video, Mail, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppNav, type TabKey } from '@/hooks/useAppNav';
import { useUser } from '@/contexts/UserContext';
import { useConversations } from '@/hooks/useConversations';

interface FooterNavProps {
  active: TabKey;
  onSelect: (key: TabKey) => void;
  onOpenCreate: () => void;
  onOpenGoLive?: () => void;
  onOpenStoryModal?: () => void;
  onOpenQuestionForm?: () => void;
  videoMode?: boolean;
}

const TABS = [
  { key: "home" as const, label: "Home", icon: Home },
  { key: "circles" as const, label: "Circles", icon: Users },
  { key: "add" as const, label: "Add", icon: Plus, center: true },
  { key: "ask" as const, label: "Ask Anonymously", icon: HeartHandshake },
  { key: "messages" as const, label: "Messages", icon: Mail },
];

const CREATE_OPTIONS = [
  { label: "Post", icon: Camera },
  { label: "Video", icon: Video },
  { label: "Circle", icon: UserPlus },
  { label: "Group Chat", icon: MessagesSquare },
  { label: "Go live", icon: Radio },
];

const FooterNav: React.FC<FooterNavProps> = ({ active, onSelect, onOpenCreate, onOpenGoLive, onOpenStoryModal, onOpenQuestionForm, videoMode = false }) => {
  const navigate = useNavigate();
  const { navigateToTab, navigateToCreatePost, navigateToCreateVideo, navigateToCreateCircle, navigateToCreateShop, navigateToMessages } = useAppNav();
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const { user } = useUser();
  const { conversations } = useConversations(user?.id);
  const totalUnreadMessages = conversations?.reduce((sum, conv) => sum + conv.unread_count, 0) || 0;

  const handleCreateClick = () => {
    if (active === 'ask' && onOpenQuestionForm) {
      onOpenQuestionForm();
    } else {
      setShowCreatePopup(!showCreatePopup);
    }
  };

  const handleCreateOptionClick = (option: string) => {
    setShowCreatePopup(false);
    if (option === 'Go live') {
      toast('Coming soon!', { description: 'Live streaming will be available soon.' });
    } else if (option === 'Post') {
      navigateToCreatePost();
    } else if (option === 'Video') {
      navigateToCreateVideo();
    } else if (option === 'Circle') {
      navigateToCreateCircle();
    } else if (option === 'Group Chat') {
      navigate('/messages?createGroup=true');
    }
  };

  const handleTabClick = (tabKey: TabKey) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // If it's a "special" tab like 'messages' or 'safe', handle accordingly
    if (tabKey === 'messages') {
      navigateToMessages();
    } else if (tabKey === 'home' || tabKey === 'circles' || tabKey === 'ask' || tabKey === 'shop') {
      navigateToTab(tabKey);
    }
    
    // Notify parent of the selection
    if (typeof onSelect === 'function') {
      onSelect(tabKey);
    }
  };
  if (videoMode) {
    return (
      <nav 
        aria-label="Primary" 
        className="w-full h-[50px] flex items-center justify-center bg-card backdrop-blur-lg border-t border-white/30"
        role="tablist"
      >
        <div className="grid grid-cols-5 place-items-center h-full w-full max-w-md px-4">
          <button
            type="button"
            role="tab"
            aria-selected={active === "home"}
            aria-current={active === "home" ? "page" : undefined}
            className={`grid place-items-center size-10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-all ${
              active === "home" ? 'bg-card/20' : 'hover:bg-card/10'
            }`}
            onClick={() => handleTabClick("home")}
            title="Home"
            aria-label="Home"
          >
            <Home className={`size-6 ${active === "home" ? 'text-primary' : 'text-muted-foreground'}`} />
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={active === "circles"}
            className="grid place-items-center size-10 rounded-full hover:bg-card/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-colors"
            onClick={() => handleTabClick("circles")}
            title="Circles"
            aria-label="Circles"
          >
            <Users className={`size-6 ${active === "circles" ? 'text-primary' : 'text-muted-foreground'}`} />
          </button>

            <div className="relative">
            <button
              type="button"
              role="tab"
              aria-selected={active === "add"}
              className="grid place-items-center size-10 rounded-full bg-secondary hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-all"
              onClick={handleCreateClick}
                title={active === 'ask' ? 'Share Story' : 'Create'}
                aria-label={active === 'ask' ? 'Share Story' : 'Create'}
            >
                {active === 'ask' ? (
                  <Edit3 className="size-6 text-white" />
                ) : (
                  <Plus className="size-6 text-white" />
                )}
            </button>
            
            {showCreatePopup && active !== 'ask' && (
              <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-card rounded-full shadow-lg border border-border transition-opacity duration-200">
                <div className="flex items-center justify-center px-4 py-2">
                  {CREATE_OPTIONS.map((option, index) => {
                    const IconComponent = option.icon;
                    return (
                      <button
                        key={option.label}
                        onClick={() => handleCreateOptionClick(option.label)}
                        className="flex flex-col items-center justify-center py-2 px-3 rounded-xl hover:bg-muted/50 transition-colors group min-w-[50px]"
                      >
                        <IconComponent className="size-4 text-primary group-hover:text-primary/80 transition-colors mb-1" />
                        <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium whitespace-nowrap">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            role="tab"
            aria-selected={active === "ask"}
            className="grid place-items-center size-10 rounded-full hover:bg-card/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-colors"
            onClick={() => handleTabClick("ask")}
            title="Ask Anonymously"
            aria-label="Ask Anonymously"
          >
            <HeartHandshake className={`size-6 ${active === "ask" ? 'text-primary' : 'text-muted-foreground'}`} />
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="relative grid place-items-center size-10 rounded-full hover:bg-card/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-colors"
            onClick={() => handleTabClick("messages")}
            title="Messages"
            aria-label="Messages"
          >
            <Mail className="size-6 text-muted-foreground" />
            {totalUnreadMessages > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] grid place-items-center bg-destructive text-white font-medium">
                {totalUnreadMessages}
              </span>
            )}
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav 
      aria-label="Primary" 
      className="fixed inset-x-0 z-40 pointer-events-none" 
      style={{ bottom: `calc(env(safe-area-inset-bottom) + 12px)` }}
    >
      <div className="mx-auto max-w-[480px] relative">
        <div
          className="pointer-events-auto mx-auto w-[92%] h-14 rounded-full bg-card border border-border shadow-xl"
          role="tablist"
        >
          <div className="grid grid-cols-5 place-items-center h-full px-2">
            <button
              type="button"
              role="tab"
              aria-selected={active === "home"}
              aria-current={active === "home" ? "page" : undefined}
              className={`grid place-items-center size-10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-all ${
                active === "home" ? 'bg-tertiary' : 'hover:bg-muted/30'
              }`}
              onClick={() => handleTabClick("home")}
              title="Home"
              aria-label="Home"
              data-testid="nav-home"
            >
              <Home className={`size-6 ${active === "home" ? 'text-primary' : 'text-muted-foreground'}`} />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={active === "circles"}
              className="grid place-items-center size-10 rounded-full hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-colors"
              onClick={() => handleTabClick("circles")}
              title="Circles"
              aria-label="Circles"
              data-testid="nav-circles"
            >
              <Users className={`size-6 ${active === "circles" ? 'text-primary' : 'text-muted-foreground'}`} />
            </button>

            <div className="relative">
              <button
                type="button"
                role="tab"
                aria-selected={active === "add"}
                className="grid place-items-center size-10 rounded-full bg-secondary hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-all"
                onClick={handleCreateClick}
                title={active === 'ask' ? 'Share Story' : 'Create'}
                aria-label={active === 'ask' ? 'Share Story' : 'Create'}
                data-testid="nav-add"
              >
                {active === 'ask' ? (
                  <Edit3 className="size-6 text-white" />
                ) : (
                  <Plus className="size-6 text-white" />
                )}
              </button>
              
              {showCreatePopup && active !== 'ask' && (
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-card rounded-full shadow-lg border border-border transition-opacity duration-200" data-testid="create-popup">
                  <div className="flex items-center justify-center px-4 py-2">
                    {CREATE_OPTIONS.map((option, index) => {
                      const IconComponent = option.icon;
                      return (
                        <button
                          key={option.label}
                          onClick={() => handleCreateOptionClick(option.label)}
                          className="flex flex-col items-center justify-center py-2 px-3 rounded-xl hover:bg-muted/50 transition-colors group min-w-[50px]"
                          data-testid={`create-${option.label.toLowerCase().replace(' ', '-')}`}
                        >
                          <IconComponent className="size-4 text-primary group-hover:text-primary/80 transition-colors mb-1" />
                          <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium whitespace-nowrap">
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              role="tab"
              aria-selected={active === "ask"}
              className="grid place-items-center size-10 rounded-full hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-colors"
              onClick={() => handleTabClick("ask")}
              title="Ask Anonymously"
              aria-label="Ask Anonymously"
              data-testid="nav-ask"
            >
              <HeartHandshake className={`size-6 ${active === "ask" ? 'text-primary' : 'text-muted-foreground'}`} />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={false}
              className="relative grid place-items-center size-10 rounded-full hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary transition-colors"
              onClick={() => handleTabClick("messages")}
              title="Messages"
              aria-label="Messages"
              data-testid="nav-messages"
            >
              <Mail className="size-6 text-muted-foreground" />
              {totalUnreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] grid place-items-center bg-destructive text-white font-medium">
                  {totalUnreadMessages}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default FooterNav;