import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { VideoLoader } from '@/components/ui/VideoLoader';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { displayCategory } from '@/lib/circleTypes';

const JoinCircle: React.FC = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const [circle, setCircle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    const fetchCircle = async () => {
      if (!inviteCode) return;

      const { data, error } = await supabase
        .from('circles')
        .select('id, name, description, avatar_url, category, is_private, creator_id, subscription_enabled, subscription_method, circle_stats(members_count)')
        .eq('invite_code', inviteCode)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setCircle(data);

      if (user) {
        const { data: membership } = await supabase
          .from('circle_members')
          .select('id')
          .eq('circle_id', data.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (membership) setAlreadyMember(true);
      }

      setLoading(false);
    };

    fetchCircle();
  }, [inviteCode, user]);

  const handleJoin = async () => {
    if (!user || !circle) return;

    // Paid before-join circles must subscribe first — send them to the
    // circle page where the subscribe flow lives
    if (circle.subscription_enabled && circle.subscription_method === 'before_join') {
      navigate(`/circle/${circle.id}`);
      return;
    }

    setJoining(true);

    try {
      const { error } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circle.id,
          user_id: user.id,
          role: 'member',
          status: 'active',
        });

      if (error) throw error;

      toast.success('Joined circle successfully!');
      navigate(`/circle/${circle.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to join circle');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <VideoLoader size="md" />
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center">
        <Users className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold mb-2">Invalid Invite Link</h1>
        <p className="text-muted-foreground mb-6">This invite link is expired or doesn't exist.</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  if (alreadyMember) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center">
        <Avatar className="w-20 h-20 mb-4">
          <AvatarImage src={circle.avatar_url || ''} />
          <AvatarFallback className="text-2xl">{circle.name?.[0]}</AvatarFallback>
        </Avatar>
        <h1 className="text-xl font-bold mb-2">{circle.name}</h1>
        <p className="text-muted-foreground mb-6">You're already a member of this circle!</p>
        <Button onClick={() => navigate(`/circle/${circle.id}`)}>Go to Circle</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center">
      <Avatar className="w-20 h-20 mb-4">
        <AvatarImage src={circle.avatar_url || ''} />
        <AvatarFallback className="text-2xl">{circle.name?.[0]}</AvatarFallback>
      </Avatar>
      <h1 className="text-xl font-bold mb-1">{circle.name}</h1>
      <p className="text-sm text-muted-foreground mb-1">{displayCategory(circle.category)}</p>
      <p className="text-sm text-muted-foreground mb-1">
        {(Array.isArray(circle.circle_stats)
          ? circle.circle_stats[0]?.members_count
          : circle.circle_stats?.members_count) || 0} members
      </p>
      <p className="text-sm text-foreground/80 mb-6 max-w-xs">{circle.description}</p>

      {user ? (
        <Button onClick={handleJoin} disabled={joining} className="px-8">
          {joining
            ? 'Joining...'
            : circle.subscription_enabled && circle.subscription_method === 'before_join'
              ? 'Subscribe'
              : 'Join'}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Sign in to join this circle</p>
          <Button onClick={() => navigate('/login', { state: { returnTo: `/join/${inviteCode}` } })}>
            Sign In
          </Button>
        </div>
      )}
    </div>
  );
};

export default JoinCircle;
