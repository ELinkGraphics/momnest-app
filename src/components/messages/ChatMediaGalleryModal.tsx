import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    ImageIcon, LinkIcon, MicIcon, Play, VideoIcon, User, Users,
    Phone, AtSign, Calendar, BellOff, MoreVertical, Search, MessageSquare,
    X, ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface ChatMediaGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    messages: any[];
    profileName: string;
    profileAvatar?: string | null;
    profileInitials: string;
    isGroup: boolean;
    memberCount?: number;
    otherUserId?: string | null;
    otherUserUsername?: string | null;
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
    otherUserId,
    otherUserUsername,
    onViewProfile,
    onMediaSelect
}) => {
    const [activeTab, setActiveTab] = useState('media');
    const [extraInfo, setExtraInfo] = useState<{
        phone?: string;
        birthday?: string;
        username?: string;
        bio?: string;
    }>({});

    // Fetch extra profile info if it's a private chat
    useEffect(() => {
        if (isOpen && otherUserId && !isGroup) {
            const fetchProfile = async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('phone, birthday, username, bio')
                    .eq('id', otherUserId)
                    .single();
                
                if (!error && data) {
                    setExtraInfo({
                        phone: data.phone || '',
                        birthday: data.birthday ? format(new Date(data.birthday), 'MMMM d, yyyy') : '',
                        username: data.username || otherUserUsername || '',
                        bio: data.bio || ''
                    });
                }
            };
            fetchProfile();
        }
    }, [isOpen, otherUserId, isGroup, otherUserUsername]);

    // Categorize messages
    const categorisedItems = useMemo(() => {
        const media: any[] = [];
        const links: any[] = [];
        const voice: any[] = [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        messages.forEach((msg) => {
            const type = msg.message_type || 'text';
            if ((type === 'photo' || type === 'video') && msg.attachment_url) {
                media.push(msg);
            } else if (type === 'voice' && msg.attachment_url) {
                voice.push(msg);
            }
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

        const sortByDate = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        media.sort(sortByDate);
        links.sort(sortByDate);
        voice.sort(sortByDate);

        return { media, links, voice };
    }, [messages]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[360px] p-0 overflow-hidden bg-[#2a1a0e] border-none shadow-[0_24px_64px_rgba(0,0,0,0.6)] outline-none rounded-[16px]">
                <style dangerouslySetInnerHTML={{ __html: `
                    :root {
                        --primary: #713A20;
                        --primary-light: #9B5230;
                        --primary-dark: #4d2714;
                        --secondary: #E09F4D;
                        --tertiary: #FFE2BE;
                        --surface: #2a1a0e;
                        --surface2: #3a2212;
                        --surface3: #4a2d18;
                        --text-main: #FFE2BE;
                        --text-muted: rgba(255,226,190,0.5);
                        --divider: rgba(255,226,190,0.08);
                    }
                    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 10px; }
                    .tab-btn { transition: color 0.15s, border-color 0.15s; }
                    .tab-btn[data-state="active"] { color: var(--secondary) !important; border-bottom: 2px solid var(--secondary) !important; }
                `}} />

                {/* Header Section */}
                <div className="relative bg-gradient-to-br from-[#9B5230] via-[#713A20] to-[#4d2714] px-4 pt-4 pb-0 overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={onClose} className="p-2 -ml-2 text-[#FFE2BE]/80 hover:text-[#FFE2BE]">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="flex gap-1">
                            <button className="p-2 text-[#FFE2BE]/80 hover:text-[#FFE2BE]">
                                <Search className="w-5 h-5" />
                            </button>
                            <button className="p-2 text-[#FFE2BE]/80 hover:text-[#FFE2BE]">
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col items-start pb-6">
                        <div className="relative mb-4 group">
                            <Avatar className="w-[84px] h-[84px] ring-2 ring-[#FFE2BE]/20 ring-offset-2 ring-offset-[#713A20]">
                                <AvatarImage src={profileAvatar || undefined} />
                                <AvatarFallback className="bg-[#4d2714] text-[#FFE2BE] text-2xl font-bold">
                                    {isGroup ? <Users className="w-10 h-10" /> : profileInitials}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                        <h2 className="text-[22px] font-bold text-[#FFE2BE] leading-tight mb-1">{profileName}</h2>
                        <div className="text-[13px] text-[#FFE2BE]/60 font-medium">
                            {isGroup ? `${memberCount || 0} members` : 'last seen recently'}
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div className="flex justify-around items-center py-4 bg-[#2a1a0e] border-b border-[#FFE2BE]/10">
                    <button onClick={() => { onClose(); onViewProfile(); }} className="flex flex-col items-center gap-1 group">
                        <div className="w-10 h-10 rounded-full bg-[#3a2212] flex items-center justify-center text-[#E09F4D] group-hover:bg-[#4a2d18] transition-colors">
                            <MessageSquare className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] text-[#E09F4D] font-medium">Message</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 group">
                        <div className="w-10 h-10 rounded-full bg-[#3a2212] flex items-center justify-center text-[#FFE2BE]/70 group-hover:bg-[#4a2d18] transition-colors">
                            <BellOff className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] text-[#FFE2BE]/70 font-medium">Mute</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 group">
                        <div className="w-10 h-10 rounded-full bg-[#3a2212] flex items-center justify-center text-[#FFE2BE]/70 group-hover:bg-[#4a2d18] transition-colors">
                            <Phone className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] text-[#FFE2BE]/70 font-medium">Call</span>
                    </button>
                </div>

                {/* Info List */}
                {!isGroup && (
                    <div className="px-4 py-3 space-y-4 bg-[#2a1a0e]">
                        {extraInfo.phone && (
                            <div className="flex items-center gap-4">
                                <Phone className="w-5 h-5 text-[#FFE2BE]/40" />
                                <div>
                                    <div className="text-[14px] text-[#FFE2BE] font-medium">{extraInfo.phone}</div>
                                    <div className="text-[12px] text-[#FFE2BE]/40">Mobile</div>
                                </div>
                            </div>
                        )}
                        {extraInfo.username && (
                            <div className="flex items-center gap-4">
                                <AtSign className="w-5 h-5 text-[#FFE2BE]/40" />
                                <div>
                                    <div className="text-[14px] text-[#FFE2BE] font-medium">@{extraInfo.username}</div>
                                    <div className="text-[12px] text-[#FFE2BE]/40">Username</div>
                                </div>
                            </div>
                        )}
                        {extraInfo.birthday && (
                            <div className="flex items-center gap-4">
                                <Calendar className="w-5 h-5 text-[#FFE2BE]/40" />
                                <div>
                                    <div className="text-[14px] text-[#FFE2BE] font-medium">{extraInfo.birthday}</div>
                                    <div className="text-[12px] text-[#FFE2BE]/40">Date of Birth</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tabs Section */}
                <div className="flex-1 min-h-0 bg-[#2a1a0e]">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                        <TabsList className="w-full flex justify-start bg-transparent border-b border-[#FFE2BE]/10 rounded-none h-12 p-0 px-2 gap-4">
                            <TabsTrigger value="media" className="tab-btn h-full bg-transparent border-none text-[13px] font-semibold text-[#FFE2BE]/40 px-2 rounded-none">
                                Media ({categorisedItems.media.length})
                            </TabsTrigger>
                            <TabsTrigger value="links" className="tab-btn h-full bg-transparent border-none text-[13px] font-semibold text-[#FFE2BE]/40 px-2 rounded-none">
                                Links ({categorisedItems.links.length})
                            </TabsTrigger>
                            <TabsTrigger value="voice" className="tab-btn h-full bg-transparent border-none text-[13px] font-semibold text-[#FFE2BE]/40 px-2 rounded-none">
                                Voice ({categorisedItems.voice.length})
                            </TabsTrigger>
                        </TabsList>

                        <div className="h-[300px] overflow-y-auto custom-scrollbar p-2">
                            <TabsContent value="media" className="m-0 focus-visible:outline-none">
                                {categorisedItems.media.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-[#FFE2BE]/20">
                                        <ImageIcon className="w-12 h-12 mb-2" />
                                        <p className="text-sm">No media yet</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-1">
                                        {categorisedItems.media.map((msg) => (
                                            <div 
                                                key={msg.id}
                                                onClick={() => onMediaSelect?.(msg.attachment_url, msg.message_type)}
                                                className="aspect-square bg-[#3a2212] cursor-pointer hover:opacity-90 transition-opacity"
                                            >
                                                {msg.message_type === 'video' ? (
                                                    <div className="relative w-full h-full">
                                                        <video src={msg.attachment_url} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                            <Play className="w-6 h-6 text-white fill-white" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <img src={msg.attachment_url} className="w-full h-full object-cover" loading="lazy" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="links" className="m-0 focus-visible:outline-none space-y-1">
                                {categorisedItems.links.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-[#FFE2BE]/20">
                                        <LinkIcon className="w-12 h-12 mb-2" />
                                        <p className="text-sm">No links yet</p>
                                    </div>
                                ) : (
                                    categorisedItems.links.map((link) => (
                                        <a 
                                            key={link.id}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#3a2212] transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-[#3a2212] flex items-center justify-center text-[#E09F4D]">
                                                <LinkIcon className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[14px] text-[#E09F4D] truncate">{link.url}</div>
                                                <div className="text-[12px] text-[#FFE2BE]/40">
                                                    {format(new Date(link.created_at), 'MMM d, yyyy')}
                                                </div>
                                            </div>
                                        </a>
                                    ))
                                )}
                            </TabsContent>

                            <TabsContent value="voice" className="m-0 focus-visible:outline-none space-y-1">
                                {categorisedItems.voice.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-[#FFE2BE]/20">
                                        <MicIcon className="w-12 h-12 mb-2" />
                                        <p className="text-sm">No voice messages yet</p>
                                    </div>
                                ) : (
                                    categorisedItems.voice.map((msg) => (
                                        <div key={msg.id} className="p-3 rounded-xl hover:bg-[#3a2212] transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-[#E09F4D] flex items-center justify-center text-white cursor-pointer hover:bg-[#9B5230] transition-colors">
                                                    <Play className="w-5 h-5 fill-current ml-0.5" />
                                                </div>
                                                <div className="flex-1 h-8 flex items-center gap-1">
                                                    {[...Array(20)].map((_, i) => (
                                                        <div 
                                                            key={i} 
                                                            className="flex-1 bg-[#FFE2BE]/10 rounded-full"
                                                            style={{ height: `${20 + Math.random() * 60}%` }}
                                                        ></div>
                                                    ))}
                                                </div>
                                                <div className="text-[12px] text-[#FFE2BE]/40 whitespace-nowrap">
                                                    {format(new Date(msg.created_at), 'HH:mm')}
                                                </div>
                                            </div>
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
