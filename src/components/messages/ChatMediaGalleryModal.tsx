import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ImageIcon, LinkIcon, MicIcon, Play, VideoIcon, User, Users } from 'lucide-react';
import { format } from 'date-fns';

interface ChatMediaGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    messages: any[];
    profileName: string;
    profileAvatar?: string | null;
    profileInitials: string;
    isGroup: boolean;
    memberCount?: number;
    onViewProfile: () => void;
    onMediaSelect?: (url: string, type: 'photo' | 'video') => void;
}

const ChatMediaGalleryModal: React.FC<ChatMediaGalleryModalProps> = ({
    isOpen,
    onClose,
    messages,
    profileName,
    profileAvatar,
    profileInitials,
    isGroup,
    memberCount,
    onViewProfile,
    onMediaSelect
}) => {
    const [activeTab, setActiveTab] = useState('media');

    // Categorize messages
    const categorisedItems = useMemo(() => {
        const media: any[] = [];
        const links: any[] = [];
        const voice: any[] = [];

        // URL regex to find links in text
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        messages.forEach((msg) => {
            const type = msg.message_type || 'text';

            if ((type === 'photo' || type === 'video') && msg.attachment_url) {
                media.push(msg);
            } else if (type === 'voice' && msg.attachment_url) {
                voice.push(msg);
            }

            // Extract links from text content
            if (msg.content) {
                const foundLinks = msg.content.match(urlRegex);
                if (foundLinks) {
                    foundLinks.forEach((link: string) => {
                        links.push({
                            id: `${msg.id}-${link}`,
                            url: link,
                            created_at: msg.created_at,
                            sender_id: msg.sender_id
                        });
                    });
                }
            }
        });

        // Sort descending by date
        media.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        links.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        voice.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return { media, links, voice };
    }, [messages]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-background/80 backdrop-blur-xl border-border/50">
                <DialogHeader className="pt-6 pb-2 px-6 bg-background/50 border-b border-border/50">
                    <div className="flex flex-col items-center gap-3">
                        <Avatar className="h-20 w-20 ring-4 ring-background shadow-xl">
                            <AvatarImage src={profileAvatar || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-2xl">
                                {isGroup ? <Users className="h-8 w-8" /> : profileInitials}
                            </AvatarFallback>
                        </Avatar>
                        <div className="text-center">
                            <DialogTitle className="text-xl font-semibold">{profileName}</DialogTitle>
                            {isGroup && memberCount && (
                                <p className="text-sm text-muted-foreground mt-1">{memberCount} members</p>
                            )}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 rounded-full px-6 bg-background/50 backdrop-blur-sm"
                            onClick={() => {
                                onClose();
                                onViewProfile();
                            }}
                        >
                            {isGroup ? <Users className="h-4 w-4 mr-2" /> : <User className="h-4 w-4 mr-2" />}
                            View {isGroup ? 'Group' : 'Profile'}
                        </Button>
                    </div>
                </DialogHeader>

                <div className="px-1 py-3">
                    <Tabs defaultValue="media" value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="px-5 mb-4">
                            <TabsList className="w-full grid grid-cols-3 bg-muted/50 p-1 rounded-xl">
                                <TabsTrigger value="media" className="rounded-lg data-[state=active]:shadow-sm">
                                    Media ({categorisedItems.media.length})
                                </TabsTrigger>
                                <TabsTrigger value="links" className="rounded-lg data-[state=active]:shadow-sm">
                                    Links ({categorisedItems.links.length})
                                </TabsTrigger>
                                <TabsTrigger value="voice" className="rounded-lg data-[state=active]:shadow-sm">
                                    Voice ({categorisedItems.voice.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="h-[400px] overflow-y-auto px-6 pb-6 custom-scrollbar">
                            {/* MEDIA TAB */}
                            <TabsContent value="media" className="m-0 mt-2">
                                {categorisedItems.media.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-50">
                                        <ImageIcon className="h-12 w-12 mb-3" />
                                        <p>No media shared yet</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-1">
                                        {categorisedItems.media.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className="aspect-square relative group cursor-pointer overflow-hidden rounded-md bg-muted/30"
                                                onClick={() => onMediaSelect?.(msg.attachment_url, msg.message_type)}
                                            >
                                                {msg.message_type === 'video' ? (
                                                    <>
                                                        <video src={msg.attachment_url} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                            <Play className="h-6 w-6 text-white" fill="white" />
                                                        </div>
                                                        <div className="absolute top-1 right-1">
                                                            <VideoIcon className="h-3 w-3 text-white drop-shadow-md" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <img src={msg.attachment_url} alt="Media" className="w-full h-full object-cover" loading="lazy" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>

                            {/* LINKS TAB */}
                            <TabsContent value="links" className="m-0 mt-2 space-y-3">
                                {categorisedItems.links.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-50">
                                        <LinkIcon className="h-12 w-12 mb-3" />
                                        <p>No links shared yet</p>
                                    </div>
                                ) : (
                                    categorisedItems.links.map((link) => (
                                        <a
                                            key={link.id}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <LinkIcon className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-blue-500 hover:underline truncate">
                                                    {link.url}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {format(new Date(link.created_at), 'MMM d, yyyy')}
                                                </p>
                                            </div>
                                        </a>
                                    ))
                                )}
                            </TabsContent>

                            {/* VOICE TAB */}
                            <TabsContent value="voice" className="m-0 mt-2 space-y-3">
                                {categorisedItems.voice.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-50">
                                        <MicIcon className="h-12 w-12 mb-3" />
                                        <p>No voice messages shared yet</p>
                                    </div>
                                ) : (
                                    categorisedItems.voice.map((msg) => (
                                        <div key={msg.id} className="flex flex-col gap-2 p-3 rounded-xl bg-muted/30">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <MicIcon className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-medium">Voice Message</span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {format(new Date(msg.created_at), 'MMM d')}
                                                </span>
                                            </div>
                                            <audio controls src={msg.attachment_url} className="w-full h-8" />
                                        </div>
                                    ))
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ChatMediaGalleryModal;
