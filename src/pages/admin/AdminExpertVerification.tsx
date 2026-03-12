import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAudit } from '@/hooks/useAdminAudit';
import { toast } from 'sonner';
import {
  Award, Search, CheckCircle, XCircle, Clock, RefreshCw,
  Mail, User, Calendar, Briefcase, Loader2, Eye,
} from 'lucide-react';

interface VerificationRequest {
  id: string;
  user_id: string;
  email: string;
  specialty: string;
  bio: string | null;
  years_experience: number | null;
  certifications: string[] | null;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile?: {
    name: string;
    username: string;
    avatar_url: string | null;
    initials: string;
    avatar_color: string;
  };
}

export default function AdminExpertVerification() {
  const { logAction } = useAdminAudit();
  const [tab, setTab] = useState('pending');
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expert_verification_requests' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const reqs = (data as any[]) || [];
    
    // Fetch profiles for all user_ids
    const userIds = [...new Set(reqs.map((r: any) => r.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, initials, avatar_color')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      reqs.forEach((r: any) => {
        r.profile = profileMap.get(r.user_id);
      });
    }

    setRequests(reqs);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (requestId: string, action: 'approved' | 'rejected') => {
    setProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    // Update the request status
    const { error } = await supabase
      .from('expert_verification_requests' as any)
      .update({
        status: action,
        admin_notes: adminNotes || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to update request');
      console.error(error);
      setProcessing(false);
      return;
    }

    // If approved, create/update expert_profiles entry
    if (action === 'approved' && selectedRequest) {
      const { error: expertError } = await supabase
        .from('expert_profiles')
        .upsert({
          user_id: selectedRequest.user_id,
          specialty: selectedRequest.specialty,
          bio: selectedRequest.bio,
          years_experience: selectedRequest.years_experience,
          is_verified: true,
          verified: true,
        }, { onConflict: 'user_id' });

      if (expertError) {
        console.error('Error creating expert profile:', expertError);
      }
    }

    logAction('expert_verification', action, requestId, { action, notes: adminNotes });
    toast.success(`Request ${action}`);
    setSelectedRequest(null);
    setAdminNotes('');
    setProcessing(false);
    fetchRequests();
  };

  const filtered = requests.filter(r => {
    const matchesTab = r.status === tab;
    const matchesSearch = !search || 
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      r.specialty.toLowerCase().includes(search.toLowerCase()) ||
      r.profile?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.profile?.username?.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const counts = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            Expert Verification
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and manage expert verification requests
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Clock className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
            <div className="text-2xl font-bold">{counts.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <CheckCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <div className="text-2xl font-bold">{counts.approved}</div>
            <div className="text-xs text-muted-foreground">Approved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <XCircle className="h-5 w-5 text-destructive mx-auto mb-1" />
            <div className="text-2xl font-bold">{counts.rejected}</div>
            <div className="text-xs text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or specialty..."
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
        </TabsList>

        {['pending', 'approved', 'rejected'].map(status => (
          <TabsContent key={status} value={status}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No {status} requests found
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map(req => (
                  <Card key={req.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          {req.profile?.avatar_url && <AvatarImage src={req.profile.avatar_url} />}
                          <AvatarFallback style={{ backgroundColor: req.profile?.avatar_color }}>
                            {req.profile?.initials || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-foreground">{req.profile?.name || 'Unknown'}</span>
                            <span className="text-sm text-muted-foreground">@{req.profile?.username}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-2">
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.email}</span>
                            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{req.specialty}</span>
                            {req.years_experience && (
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{req.years_experience} yrs</span>
                            )}
                          </div>
                          {req.bio && <p className="text-sm text-muted-foreground line-clamp-2">{req.bio}</p>}
                          <div className="text-xs text-muted-foreground mt-1">
                            Submitted {new Date(req.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSelectedRequest(req); setAdminNotes(req.admin_notes || ''); }}
                        >
                          <Eye className="h-4 w-4 mr-1" /> Review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Review Application
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-12 w-12">
                  {selectedRequest.profile?.avatar_url && <AvatarImage src={selectedRequest.profile.avatar_url} />}
                  <AvatarFallback style={{ backgroundColor: selectedRequest.profile?.avatar_color }}>
                    {selectedRequest.profile?.initials || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">{selectedRequest.profile?.name}</p>
                  <p className="text-sm text-muted-foreground">@{selectedRequest.profile?.username}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground text-xs mb-1">Email</p>
                  <p className="font-medium">{selectedRequest.email}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground text-xs mb-1">Specialty</p>
                  <p className="font-medium">{selectedRequest.specialty}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground text-xs mb-1">Experience</p>
                  <p className="font-medium">{selectedRequest.years_experience ? `${selectedRequest.years_experience} years` : 'Not specified'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground text-xs mb-1">Submitted</p>
                  <p className="font-medium">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {selectedRequest.bio && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground text-xs mb-1">Bio</p>
                  <p className="text-sm">{selectedRequest.bio}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                />
              </div>

              {selectedRequest.status === 'pending' ? (
                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleAction(selectedRequest.id, 'approved')}
                    disabled={processing}
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleAction(selectedRequest.id, 'rejected')}
                    disabled={processing}
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                    Reject
                  </Button>
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  This request has been {selectedRequest.status}.
                  {selectedRequest.reviewed_at && (
                    <span> on {new Date(selectedRequest.reviewed_at).toLocaleDateString()}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
