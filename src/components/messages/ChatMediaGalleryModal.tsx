import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
    ImageIcon, LinkIcon, MicIcon, Play, VideoIcon, User, Users,
    Phone, AtSign, Calendar, BellOff, MoreHorizontal, MessageSquare,
    X, PhoneCall
} from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/* ─────────── CSS Keyframes & Styles ─────────── */
const modalStyles = `
  /* 1. Entrance animation */
  @keyframes profileModalSlideUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .profile-modal-card {
    animation: profileModalSlideUp 0.4s ease-out both;
  }

  /* 2. Animated gradient ring for avatar */
  @keyframes spinGradientRing {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .avatar-gradient-ring {
    background: conic-gradient(from 0deg, #E09F4D, #713A20, #FFE2BE, #E09F4D);
    border-radius: 50%;
    padding: 3px;
    animation: spinGradientRing 3s linear infinite;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar-gradient-ring .avatar-inner {
    border-radius: 50%;
    overflow: hidden;
    width: 96px;
    height: 96px;
  }

  /* 3. Action button hover glow */
  .action-btn-glow {
    transition: all 0.18s ease;
    cursor: pointer;
  }
  .action-btn-glow:hover {
    background: rgba(224,159,77,0.12);
    box-shadow: 0 0 10px rgba(224,159,77,0.2);
    transform: scale(1.06);
  }

  /* 4. Info row hover highlight */
  .info-row-hover {
    cursor: pointer;
    border-radius: 8px;
    padding: 14px 8px;
    transition: background 0.15s;
  }
  .info-row-hover:hover {
    background: rgba(255,226,190,0.04);
  }

  /* 5. Animated tab underline */
  @keyframes tabUnderlineExpand {
    from { width: 0; }
    to   { width: 100%; }
  }
  .profile-tab-btn {
    position: relative;
    transition: color 0.15s;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0 4px 12px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,226,190,0.4);
  }
  .profile-tab-btn::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    width: 0;
    background: #E09F4D;
    border-radius: 1px;
    transition: width 0.25s ease;
  }
  .profile-tab-btn.active {
    color: #E09F4D;
  }
  .profile-tab-btn.active::after {
    animation: tabUnderlineExpand 0.25s ease forwards;
  }

  /* 6. Media grid hover zoom */
  .media-grid-cell {
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s ease;
    position: relative;
  }
  .media-grid-cell:hover {
    transform: scale(1.04);
  }
  .media-grid-cell::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(224,159,77,0);
    transition: background 0.2s ease;
    pointer-events: none;
  }
  .media-grid-cell:hover::after {
    background: rgba(224,159,77,0.08);
  }

  /* 7. Animated waveform bars */
  @keyframes waveBar {
    0%, 100% { height: 6px; }
    50% { height: var(--bar-h); }
  }
  .wave-bar {
    width: 3px;
    border-radius: 999px;
    background: #E09F4D;
    animation: waveBar 0.8s ease-in-out infinite alternate;
  }

  /* 8. Close button hover */
  .close-btn-rotate {
    transition: background 0.2s, transform 0.2s;
    cursor: pointer;
  }
  .close-btn-rotate:hover {
    background: rgba(255,255,255,0.15);
    transform: rotate(90deg);
  }

  /* Scrollbar */
  .profile-custom-scroll::-webkit-scrollbar { width: 4px; }
  .profile-custom-scroll::-webkit-scrollbar-track { background: transparent; }
  .profile-custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,226,190,0.08); border-radius: 10px; }
`;

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
        birthdayRaw?: string;
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
                        birthday: data.birthday ? format(new Date(data.birthday), 'MMM d, yyyy') : '',
                        birthdayRaw: data.birthday || '',
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

    // Compute age from birthday
    const age = useMemo(() => {
        if (!extraInfo.birthdayRaw) return null;
        try { return differenceInYears(new Date(), new Date(extraInfo.birthdayRaw)); }
        catch { return null; }
    }, [extraInfo.birthdayRaw]);

    // Waveform bar heights and animation delays
    const waveBars = [
        { h: '14px', delay: '0ms' },
        { h: '20px', delay: '80ms' },
        { h: '10px', delay: '160ms' },
        { h: '24px', delay: '240ms' },
        { h: '10px', delay: '160ms' },
        { h: '20px', delay: '80ms' },
        { h: '14px', delay: '0ms' },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="max-w-[380px] p-0 overflow-hidden border-none shadow-[0_24px_64px_rgba(0,0,0,0.6)] outline-none rounded-[16px] gap-0"
                style={{ background: '#2a1a0e' }}
            >
                <style dangerouslySetInnerHTML={{ __html: modalStyles }} />

                <div className="profile-modal-card">
                    {/* ─── Header with Gradient ─── */}
                    <div
                        className="relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(160deg, #9B5230 0%, #713A20 60%, #4d2714 100%)',
                            padding: '20px 16px 24px',
                        }}
                    >
                        {/* Close button (top‑right) */}
                        <button
                            onClick={onClose}
                            className="close-btn-rotate absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-[#FFE2BE]/70"
                            style={{ background: 'rgba(0,0,0,0.15)' }}
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {/* Centered Avatar */}
                        <div className="flex flex-col items-center mt-2">
                            <div className="avatar-gradient-ring mb-4">
                                <div className="avatar-inner">
                                    <Avatar className="w-full h-full" style={{ width: 96, height: 96 }}>
                                        <AvatarImage src={profileAvatar || undefined} />
                                        <AvatarFallback
                                            className="text-3xl font-bold text-white"
                                            style={{ background: '#9B5230', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            {isGroup ? <Users className="w-10 h-10" /> : profileInitials}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            </div>

                            {/* Name & Status */}
                            <h2
                                className="font-bold leading-tight mb-1 text-center"
                                style={{ fontSize: 20, color: '#FFE2BE' }}
                            >
                                {profileName}
                            </h2>
                            <span style={{ fontSize: 13, color: 'rgba(255,226,190,0.5)' }}>
                                {isGroup ? `${memberCount || 0} members` : 'last seen recently'}
                            </span>
                        </div>
                    </div>

                    {/* ─── Action Buttons ─── */}
                    <div
                        className="flex justify-around items-center py-4"
                        style={{ background: '#2a1a0e', borderBottom: '1px solid rgba(255,226,190,0.08)' }}
                    >
                        {[
                            { icon: <MessageSquare className="w-5 h-5" />, label: 'Message', onClick: () => { onClose(); onViewProfile(); } },
                            { icon: <BellOff className="w-5 h-5" />, label: 'Mute' },
                            { icon: <PhoneCall className="w-5 h-5" />, label: 'Call' },
                            { icon: <MoreHorizontal className="w-5 h-5" />, label: 'More' },
                        ].map((btn) => (
                            <button
                                key={btn.label}
                                onClick={btn.onClick}
                                className="action-btn-glow flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl"
                            >
                                <span style={{ color: btn.label === 'Message' ? '#E09F4D' : 'rgba(255,226,190,0.6)' }}>
                                    {btn.icon}
                                </span>
                                <span
                                    className="font-medium"
                                    style={{ fontSize: 11, color: btn.label === 'Message' ? '#E09F4D' : 'rgba(255,226,190,0.6)' }}
                                >
                                    {btn.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* ─── Info Rows ─── */}
                    {!isGroup && (
                        <div className="px-3 py-2" style={{ background: '#2a1a0e' }}>
                            {extraInfo.phone && (
                                <div className="info-row-hover flex items-center gap-4">
                                    <Phone className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(255,226,190,0.35)' }} />
                                    <div>
                                        <div className="font-medium" style={{ fontSize: 14, color: '#FFE2BE' }}>{extraInfo.phone}</div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,226,190,0.4)' }}>Mobile</div>
                                    </div>
                                </div>
                            )}
                            {extraInfo.username && (
                                <div className="info-row-hover flex items-center gap-4">
                                    <AtSign className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(255,226,190,0.35)' }} />
                                    <div>
                                        <div className="font-medium" style={{ fontSize: 14, color: '#FFE2BE' }}>@{extraInfo.username}</div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,226,190,0.4)' }}>Username</div>
                                    </div>
                                </div>
                            )}
                            {extraInfo.birthday && (
                                <div className="info-row-hover flex items-center gap-4">
                                    <Calendar className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(255,226,190,0.35)' }} />
                                    <div>
                                        <div className="font-medium" style={{ fontSize: 14, color: '#FFE2BE' }}>
                                            {extraInfo.birthday}{age !== null ? ` (${age} years old)` : ''}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,226,190,0.4)' }}>Birthday</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── Tab Bar ─── */}
                    <div
                        className="flex gap-5 px-4 pt-2"
                        style={{ borderBottom: '1px solid rgba(255,226,190,0.08)', background: '#2a1a0e' }}
                    >
                        {(['media', 'links', 'voice'] as const).map((tab) => {
                            const count = categorisedItems[tab === 'media' ? 'media' : tab === 'links' ? 'links' : 'voice'].length;
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`profile-tab-btn ${activeTab === tab ? 'active' : ''}`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
                                </button>
                            );
                        })}
                    </div>

                    {/* ─── Tab Content ─── */}
                    <div
                        className="profile-custom-scroll"
                        style={{ height: 260, overflowY: 'auto', background: '#2a1a0e', padding: 8 }}
                    >
                        {/* MEDIA */}
                        {activeTab === 'media' && (
                            categorisedItems.media.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12" style={{ color: 'rgba(255,226,190,0.2)' }}>
                                    <ImageIcon className="w-12 h-12 mb-2" />
                                    <p style={{ fontSize: 14 }}>No media yet</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-1" style={{ overflow: 'hidden' }}>
                                    {categorisedItems.media.map((msg) => (
                                        <div
                                            key={msg.id}
                                            onClick={() => onMediaSelect?.(msg.attachment_url, msg.message_type)}
                                            className="media-grid-cell aspect-square rounded-md"
                                            style={{ background: '#3a2212' }}
                                        >
                                            {msg.message_type === 'video' ? (
                                                <div className="relative w-full h-full">
                                                    <video src={msg.attachment_url} className="w-full h-full object-cover rounded-md" />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md">
                                                        <Play className="w-6 h-6 text-white fill-white" />
                                                    </div>
                                                    <span
                                                        className="absolute bottom-1 left-1 px-1 rounded text-white font-bold"
                                                        style={{ fontSize: 9, background: 'rgba(0,0,0,0.5)' }}
                                                    >
                                                        VID
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="relative w-full h-full">
                                                    <img src={msg.attachment_url} className="w-full h-full object-cover rounded-md" loading="lazy" />
                                                    <span
                                                        className="absolute bottom-1 left-1 px-1 rounded text-white font-bold"
                                                        style={{ fontSize: 9, background: 'rgba(0,0,0,0.5)' }}
                                                    >
                                                        IMG
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* LINKS */}
                        {activeTab === 'links' && (
                            categorisedItems.links.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12" style={{ color: 'rgba(255,226,190,0.2)' }}>
                                    <LinkIcon className="w-12 h-12 mb-2" />
                                    <p style={{ fontSize: 14 }}>No links yet</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {categorisedItems.links.map((link) => (
                                        <a
                                            key={link.id}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                                            style={{ color: '#E09F4D' }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = '#3a2212')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                                style={{ background: '#3a2212', color: '#E09F4D' }}
                                            >
                                                <LinkIcon className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate" style={{ fontSize: 14, color: '#E09F4D' }}>{link.url}</div>
                                                <div style={{ fontSize: 12, color: 'rgba(255,226,190,0.4)' }}>
                                                    {format(new Date(link.created_at), 'MMM d, yyyy')}
                                                </div>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )
                        )}

                        {/* VOICE */}
                        {activeTab === 'voice' && (
                            categorisedItems.voice.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12" style={{ color: 'rgba(255,226,190,0.2)' }}>
                                    <MicIcon className="w-12 h-12 mb-2" />
                                    <p style={{ fontSize: 14 }}>No voice messages yet</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {categorisedItems.voice.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className="p-3 rounded-xl transition-colors"
                                            onMouseEnter={(e) => (e.currentTarget.style.background = '#3a2212')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0 transition-colors"
                                                    style={{ background: '#E09F4D', color: 'white' }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#9B5230')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = '#E09F4D')}
                                                >
                                                    <Play className="w-5 h-5 fill-current ml-0.5" />
                                                </div>
                                                {/* Animated waveform bars */}
                                                <div className="flex-1 flex items-center justify-center gap-1 h-8">
                                                    {waveBars.map((bar, i) => (
                                                        <div
                                                            key={i}
                                                            className="wave-bar"
                                                            style={{
                                                                '--bar-h': bar.h,
                                                                animationDelay: bar.delay,
                                                                height: bar.h,
                                                            } as React.CSSProperties}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="whitespace-nowrap" style={{ fontSize: 12, color: 'rgba(255,226,190,0.4)' }}>
                                                    {format(new Date(msg.created_at), 'HH:mm')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ChatMediaGalleryModal;
