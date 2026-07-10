import React, { useState } from 'react';
import { Search, UserPlus, Crown, Shield, MessageCircle, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import InviteLinkModal from './InviteLinkModal';

interface CircleMembersProps {
  circle: any;
  isOwner: boolean;
  onViewProfile?: (userId: string) => void;
}

const CircleMembers: React.FC<CircleMembersProps> = ({ circle, isOwner, onViewProfile }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ['circle-members', circle?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('circle_members')
        .select(`
          *,
          profiles:user_id (
            id,
            name,
            username,
            avatar_url,
            initials,
            avatar_color,
            is_online
          )
        `)
        .eq('circle_id', circle.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!circle?.id,
  });

  // Pending join requests — visible to circle managers only
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['circle-join-requests', circle?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('circle_members')
        .select(`
          *,
          profiles:user_id (
            id,
            name,
            username,
            avatar_url,
            initials,
            avatar_color
          )
        `)
        .eq('circle_id', circle.id)
        .eq('status', 'pending')
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!circle?.id && isOwner,
  });

  const handleRespondRequest = async (request: any, approve: boolean) => {
    setRespondingId(request.id);
    try {
      const { error } = await supabase.rpc('respond_circle_join_request', {
        _circle_id: circle.id,
        _user_id: request.user_id,
        _approve: approve,
      });
      if (error) throw error;
      toast.success(approve ? `${request.profiles?.name || 'Member'} joined the circle` : 'Request declined');
      queryClient.invalidateQueries({ queryKey: ['circle-join-requests', circle.id] });
      queryClient.invalidateQueries({ queryKey: ['circle-members', circle.id] });
      queryClient.invalidateQueries({ queryKey: ['circle', circle.id] });
    } catch (error: any) {
      console.error('Error responding to join request:', error);
      toast.error(error.message || 'Failed to respond to request');
    } finally {
      setRespondingId(null);
    }
  };

  const filteredMembers = (members || []).filter((member: any) =>
    member.profiles?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.profiles?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'creator':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'moderator':
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'creator':
        return <Badge variant="default">Creator</Badge>;
      case 'moderator':
        return <Badge variant="secondary">Moderator</Badge>;
      default:
        return null;
    }
  };

  // Determine role - mark circle creator
  const getMemberRole = (member: any) => {
    if (member.profiles?.id === circle.creator_id) return 'creator';
    return member.role || 'member';
  };

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Members ({members?.length || 0})</h3>
        {isOwner && circle?.invite_code && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Pending join requests */}
      {isOwner && pendingRequests.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            Join Requests
            <Badge variant="secondary" className="text-badge">{pendingRequests.length}</Badge>
          </h4>
          <div className="space-y-2">
            {pendingRequests.map((request: any) => (
              <Card key={request.id} className="mx-0 border-secondary/40">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <button
                      className="flex-shrink-0 hover:opacity-80 transition-opacity"
                      onClick={() => onViewProfile?.(request.profiles?.id)}
                    >
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold overflow-hidden"
                        style={{ backgroundColor: request.profiles?.avatar_color || '#6366f1' }}
                      >
                        {request.profiles?.avatar_url ? (
                          <img src={request.profiles.avatar_url} alt={request.profiles.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          request.profiles?.initials || request.profiles?.name?.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    </button>
                    <button
                      className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                      onClick={() => onViewProfile?.(request.profiles?.id)}
                    >
                      <p className="font-medium text-sm text-foreground truncate">{request.profiles?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{request.profiles?.username}</p>
                    </button>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        disabled={respondingId === request.id}
                        onClick={() => handleRespondRequest(request, true)}
                        aria-label="Approve request"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={respondingId === request.id}
                        onClick={() => handleRespondRequest(request, false)}
                        aria-label="Decline request"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredMembers.length > 0 ? (
        <div className="max-w-2xl mx-auto space-y-3">
          {filteredMembers.map((member: any) => {
            const role = getMemberRole(member);
            return (
              <Card key={member.id} className="hover:shadow-md transition-shadow mx-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <button
                      className="relative flex-shrink-0 hover:opacity-80 transition-opacity"
                      onClick={() => onViewProfile?.(member.profiles?.id)}
                    >
                      <div
                        className="h-12 w-12 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                        style={{ backgroundColor: member.profiles?.avatar_color || '#6366f1' }}
                      >
                        {member.profiles?.avatar_url ? (
                          <img src={member.profiles.avatar_url} alt={member.profiles.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          member.profiles?.initials || member.profiles?.name?.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      {member.profiles?.is_online && (
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 border-2 border-background rounded-full" />
                      )}
                    </button>

                    <button
                      className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                      onClick={() => onViewProfile?.(member.profiles?.id)}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-medium text-foreground truncate flex-shrink-0 max-w-[150px]">
                          {member.profiles?.name}
                        </h4>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {getRoleIcon(role)}
                          {getRoleBadge(role)}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        @{member.profiles?.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(member.joined_at).toLocaleDateString()}
                      </p>
                    </button>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {role !== 'creator' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2"
                        onClick={() => onViewProfile?.(member.profiles?.id)}
                      >
                        View Profile
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? 'No members match your search' : 'No members yet'}
        </div>
      )}

      {/* Invite Link Modal */}
      {circle?.invite_code && (
        <InviteLinkModal
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          inviteCode={circle.invite_code}
          circleName={circle.name}
        />
      )}
    </div>
  );
};

export default CircleMembers;
