import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Pencil, UserPlus, Link2, Check, X, Loader2, Users, Crown,
  Shield, ShieldOff, LogOut, UserMinus, BellOff, Bell, Camera,
  Image, BarChart3, Plus, QrCode, Volume2, VolumeX, Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CustomFilePicker } from '@/components/CustomFilePicker';
import { useQueryClient } from '@tanstack/react-query';
import FriendPicker from '@/components/circles/FriendPicker';
import { useGroupMembers, useGroupInfo, useGroupMute, useSharedMedia, useGroupPolls } from '@/hooks/useGroupManagement';

interface Friend { id: string; name: string; username: string; avatar_url: string | null; initials: string; avatar_color: string; }

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  currentUserId: string;
  createdBy?: string;
}

const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  isOpen, onClose, conversationId, groupName, groupAvatarUrl, currentUserId, createdBy,
}) => {
  const queryClient = useQueryClient();

  // State
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(groupName);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editedDesc, setEditedDesc] = useState('');
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([]);
  const [isAddingSaving, setIsAddingSaving] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showMuteOptions, setShowMuteOptions] = useState(false);

  // Poll creation state
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollMultiple, setPollMultiple] = useState(false);

  // Hooks
  const { members, isLoading: membersLoading, promoteToAdmin, demoteAdmin, removeMember, leaveGroup } = useGroupMembers(conversationId, isOpen);
  const { groupInfo, updateDescription, updateAvatar, updateName } = useGroupInfo(conversationId, isOpen);
  const { isMuted, mute, unmute } = useGroupMute(conversationId, currentUserId);
  const { data: sharedMedia = [] } = useSharedMedia(conversationId, isOpen);
  const { polls, createPoll, endPoll, vote, unvote } = useGroupPolls(conversationId, currentUserId, isOpen);

  const resolvedCreatedBy = groupInfo?.created_by || createdBy;
  const isCreator = currentUserId === resolvedCreatedBy;
  const currentMember = members.find(m => m.id === currentUserId);
  const isAdmin = currentMember?.is_admin || isCreator;
  const inviteLink = `${window.location.origin}/messages?join_group=${conversationId}`;

  const handleSaveName = async () => {
    if (!editedName.trim()) return;
    await updateName.mutateAsync(editedName.trim());
    setIsEditingName(false);
  };

  const handleSaveDesc = async () => {
    await updateDescription.mutateAsync(editedDesc.trim());
    setIsEditingDesc(false);
  };



  const handleAddMembers = async () => {
    if (selectedFriends.length === 0) return;
    setIsAddingSaving(true);
    try {
      const { error } = await supabase.from('conversation_members').insert(
        selectedFriends.map(f => ({ conversation_id: conversationId, user_id: f.id }))
      );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['group-members', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(`Added ${selectedFriends.length} member(s)`);
      setIsAddingMembers(false);
      setSelectedFriends([]);
    } catch (err: any) {
      toast.error(err.code === '23505' ? 'Some members already in group' : 'Failed to add members');
    } finally {
      setIsAddingSaving(false);
    }
  };

  const handleCreatePoll = () => {
    const validOptions = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2) {
      toast.error('Need a question and at least 2 options');
      return;
    }
    createPoll.mutate({ question: pollQuestion, options: validOptions, is_anonymous: pollAnonymous, is_multiple_choice: pollMultiple });
    setPollQuestion(''); setPollOptions(['', '']); setShowPollForm(false);
    setPollAnonymous(false); setPollMultiple(false);
  };

  const handleLeave = () => {
    if (confirm('Are you sure you want to leave this group?')) {
      leaveGroup.mutate(currentUserId, { onSuccess: onClose });
    }
  };

  const displayAvatar = groupInfo?.group_avatar_url || groupAvatarUrl;
  const displayName = groupInfo?.group_name || groupName;
  const description = groupInfo?.description || '';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Group Info
          </DialogTitle>
        </DialogHeader>

        {/* Header: Avatar + Name */}
        <div className="flex flex-col items-center gap-2 px-4 pb-3 border-b border-border">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={displayAvatar || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-2xl">
                {displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isAdmin && (
              <CustomFilePicker
                onUpload={async (file) => {
                  await updateAvatar.mutateAsync(file as File);
                }}
                accept="image/*"
                hidePreviewList
              >
                <button className="absolute bottom-0 right-0 rounded-full p-1.5 shadow-md bg-primary text-primary-foreground touch-target">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </CustomFilePicker>
            )}
          </div>

          {isEditingName ? (
            <div className="flex items-center gap-2 w-full max-w-xs">
              <Input value={editedName} onChange={e => setEditedName(e.target.value)} className="text-center" autoFocus />
              <Button size="icon" variant="ghost" onClick={handleSaveName} disabled={updateName.isPending}>
                {updateName.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-500" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setIsEditingName(false); setEditedName(displayName); }}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{displayName}</h3>
              {isAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingName(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{members.length} members</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 grid grid-cols-4">
            <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
            <TabsTrigger value="members" className="text-xs">Members</TabsTrigger>
            <TabsTrigger value="media" className="text-xs">Media</TabsTrigger>
            <TabsTrigger value="polls" className="text-xs">Polls</TabsTrigger>
          </TabsList>

          {/* ── Info Tab ── */}
          <TabsContent value="info" className="flex-1 overflow-auto px-4 pb-4 space-y-4">
            {/* Description */}
            <div>
              <Label className="text-xs font-medium">Description</Label>
              {isEditingDesc ? (
                <div className="space-y-2 mt-1">
                  <Textarea value={editedDesc} onChange={e => setEditedDesc(e.target.value)} placeholder="Group description..." rows={3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveDesc} disabled={updateDescription.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-sm text-muted-foreground cursor-pointer" onClick={() => { if (isAdmin) { setEditedDesc(description); setIsEditingDesc(true); } }}>
                  {description || (isAdmin ? 'Tap to add description...' : 'No description')}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setIsAddingMembers(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Add People
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success('Link copied'); }}>
                <Link2 className="h-4 w-4 mr-2" /> Copy Invite Link
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowQR(!showQR)}>
                <QrCode className="h-4 w-4 mr-2" /> {showQR ? 'Hide' : 'Show'} QR Code
              </Button>
              {showQR && (
                <div className="flex justify-center p-3 bg-muted rounded-lg">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(inviteLink)}`} alt="QR Code" className="w-40 h-40 rounded" />
                </div>
              )}

              {/* Mute */}
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => isMuted ? unmute.mutate() : setShowMuteOptions(!showMuteOptions)}>
                {isMuted ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
                {isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
              </Button>
              {showMuteOptions && !isMuted && (
                <div className="flex gap-2 pl-6">
                  {[{ label: '1 hour', value: '1h' as const }, { label: '24 hours', value: '24h' as const }, { label: 'Forever', value: 'forever' as const }].map(opt => (
                    <Button key={opt.value} size="sm" variant="secondary" onClick={() => { mute.mutate(opt.value); setShowMuteOptions(false); }}>
                      {opt.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Leave */}
              <Button variant="outline" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={handleLeave}>
                <LogOut className="h-4 w-4 mr-2" /> Leave Group
              </Button>
            </div>

            {/* Add Members Inline */}
            {isAddingMembers && (
              <div className="border border-border rounded-lg p-3 space-y-3">
                <Label className="text-xs">Select friends to add</Label>
                <FriendPicker multiSelect selected={selectedFriends} onSelect={setSelectedFriends} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddMembers} disabled={selectedFriends.length === 0 || isAddingSaving}>
                    {isAddingSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Add {selectedFriends.length > 0 ? `(${selectedFriends.length})` : ''}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsAddingMembers(false); setSelectedFriends([]); }}>Cancel</Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Members Tab ── */}
          <TabsContent value="members" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-[300px]">
              {membersLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1 pr-2">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">{member.initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm truncate">{member.name}</p>
                          {member.is_creator && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          {member.is_admin && !member.is_creator && <Shield className="h-3.5 w-3.5 text-primary shrink-0" />}
                          {member.id === currentUserId && <span className="text-xs text-muted-foreground">(You)</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">@{member.username}</p>
                      </div>
                      {/* Admin actions */}
                      {isAdmin && member.id !== currentUserId && !member.is_creator && (
                        <div className="hidden group-hover:flex gap-1">
                          {member.is_admin ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove admin" onClick={() => demoteAdmin.mutate(member.id)}>
                              <ShieldOff className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Make admin" onClick={() => promoteToAdmin.mutate(member.id)}>
                              <Shield className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Remove" onClick={() => removeMember.mutate(member.id)}>
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ── Media Tab ── */}
          <TabsContent value="media" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-[300px]">
              {sharedMedia.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Image className="h-10 w-10 mb-2 opacity-50" />
                  <p className="text-sm">No shared media yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {sharedMedia.map((item: any) => (
                    <div key={item.id} className="aspect-square rounded-md overflow-hidden bg-muted">
                      {item.message_type?.startsWith('video') ? (
                        <video src={item.attachment_url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.attachment_url} className="w-full h-full object-cover" alt="" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ── Polls Tab ── */}
          <TabsContent value="polls" className="flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                <Button size="sm" variant="outline" className="w-full" onClick={() => setShowPollForm(!showPollForm)}>
                  <Plus className="h-4 w-4 mr-1" /> Create Poll
                </Button>

                {showPollForm && (
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <Input placeholder="Ask a question..." value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} />
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input placeholder={`Option ${i + 1}`} value={opt} onChange={e => { const n = [...pollOptions]; n[i] = e.target.value; setPollOptions(n); }} />
                        {i >= 2 && (
                          <Button size="icon" variant="ghost" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 10 && (
                      <Button size="sm" variant="ghost" onClick={() => setPollOptions([...pollOptions, ''])}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                      </Button>
                    )}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Anonymous</Label>
                      <Switch checked={pollAnonymous} onCheckedChange={setPollAnonymous} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Multiple choice</Label>
                      <Switch checked={pollMultiple} onCheckedChange={setPollMultiple} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleCreatePoll} disabled={createPoll.isPending}>Create</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowPollForm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {polls.map((poll: any) => {
                  const options = poll.options as any[];
                  const votes = poll.poll_votes || [];
                  const totalVotes = votes.length;
                  const userVotes = votes.filter((v: any) => v.user_id === currentUserId).map((v: any) => v.option_id);
                  const isPollCreator = poll.creator_id === currentUserId;
                  const isEnded = poll.status === 'ended';

                  return (
                    <div key={poll.id} className={`border rounded-lg p-3 space-y-2 ${isEnded ? 'border-muted opacity-75' : 'border-border'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          <p className="font-medium text-sm">{poll.question}</p>
                        </div>
                        {isPollCreator && !isEnded && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" onClick={() => endPoll.mutate(poll.id)}>
                            End
                          </Button>
                        )}
                      </div>
                      {isEnded && <p className="text-xs text-destructive font-medium">Poll ended</p>}
                      {poll.is_anonymous && <p className="text-xs text-muted-foreground">Anonymous poll</p>}
                      <div className="space-y-1.5">
                        {options.map((opt: any) => {
                          const optVotes = votes.filter((v: any) => v.option_id === opt.id).length;
                          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                          const hasVoted = userVotes.includes(opt.id);

                          return (
                            <button
                              key={opt.id}
                              className="w-full text-left"
                              disabled={isEnded}
                              onClick={() => hasVoted ? unvote.mutate({ pollId: poll.id, optionId: opt.id }) : vote.mutate({ pollId: poll.id, optionId: opt.id })}
                            >
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className={hasVoted ? 'font-semibold text-primary' : ''}>{opt.text}</span>
                                <span className="text-muted-foreground">{pct}%</span>
                              </div>
                              <Progress value={pct} className="h-1.5" />
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}

                {polls.length === 0 && !showPollForm && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mb-2 opacity-50" />
                    <p className="text-sm">No polls yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default GroupInfoModal;
