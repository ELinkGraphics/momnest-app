import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Award, Mail, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExpertVerificationModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
}

const ExpertVerificationModal: React.FC<ExpertVerificationModalProps> = ({ open, onClose, userId }) => {
  const [email, setEmail] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    supabase
      .from('expert_verification_requests' as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const requests = data as any[];
        setExistingRequest(requests?.[0] || null);
        setLoading(false);
      });
  }, [open, userId]);

  const handleSubmit = async () => {
    if (!email.trim() || !specialty.trim()) {
      toast.error('Please fill in email and specialty');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from('expert_verification_requests' as any)
      .insert({
        user_id: userId,
        email: email.trim(),
        specialty: specialty.trim(),
        bio: bio.trim() || null,
        years_experience: yearsExperience ? parseInt(yearsExperience) : null,
        status: 'pending',
      } as any);

    if (error) {
      toast.error('Failed to submit request');
      console.error(error);
    } else {
      toast.success('Expert verification request submitted!');
      setExistingRequest({ status: 'pending', email, specialty, created_at: new Date().toISOString() });
      setEmail('');
      setSpecialty('');
      setBio('');
      setYearsExperience('');
    }
    setSubmitting(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending Review</Badge>;
      case 'approved':
        return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Expert Verification
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : existingRequest ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Request Status</span>
                {statusBadge(existingRequest.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Email:</span> {existingRequest.email}</p>
                <p><span className="font-medium text-foreground">Specialty:</span> {existingRequest.specialty}</p>
                <p><span className="font-medium text-foreground">Submitted:</span> {new Date(existingRequest.created_at).toLocaleDateString()}</p>
              </div>
              {existingRequest.status === 'pending' && (
                <p className="text-xs text-muted-foreground">
                  Your request is being reviewed. We'll contact you via email to discuss further.
                </p>
              )}
              {existingRequest.status === 'rejected' && existingRequest.admin_notes && (
                <p className="text-xs text-destructive">
                  Note: {existingRequest.admin_notes}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Apply to become a verified expert. We'll review your application and contact you via email.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Contact Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="pl-9"
                    type="email"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Specialty *</label>
                <Input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="e.g. Pediatrics, Nutrition, Mental Health"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Years of Experience</label>
                <Input
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  placeholder="e.g. 5"
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Brief Bio</label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about your expertise and qualifications..."
                  rows={3}
                />
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Award className="h-4 w-4 mr-2" />}
              Submit Application
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExpertVerificationModal;
