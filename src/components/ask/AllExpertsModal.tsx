import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BadgeCheck, ThumbsUp } from 'lucide-react';
import { useExpertProfiles } from '@/hooks/useExpertProfiles';
import { VideoLoader } from '@/components/ui/VideoLoader';
import { ExpertProfileModal } from './ExpertProfileModal';

interface AllExpertsModalProps {
  open: boolean;
  onClose: () => void;
}

export const AllExpertsModal: React.FC<AllExpertsModalProps> = ({ open, onClose }) => {
  const { data: experts, isLoading } = useExpertProfiles(50);
  const navigate = useNavigate();
  const [selectedExpert, setSelectedExpert] = useState<any>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-primary" />
              Verified Experts
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <VideoLoader size="md" />
            </div>
          ) : !experts || experts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No verified experts yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {experts.map((expert: any) => (
                <Card key={expert.id} className="overflow-hidden border-primary/10">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                        className="w-12 h-12 border-2 border-primary/20 cursor-pointer"
                        onClick={() => setSelectedExpert(expert)}
                      >
                        <AvatarImage src={expert.profiles?.avatar_url} />
                        <AvatarFallback style={{ backgroundColor: expert.profiles?.avatar_color }}>
                          {expert.profiles?.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setSelectedExpert(expert)}
                          >
                            {expert.profiles?.name || expert.profiles?.username}
                          </h3>
                          <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                          <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                            Expert
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{expert.specialty}</p>
                        {expert.years_experience && (
                          <p className="text-xs text-muted-foreground">
                            {expert.years_experience} years experience
                          </p>
                        )}
                      </div>
                      {expert.answer_likes > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ThumbsUp className="w-3 h-3" />
                          {expert.answer_likes}
                        </div>
                      )}
                    </div>

                    {expert.bio && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{expert.bio}</p>
                    )}

                    {expert.featured_answer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => {
                          onClose();
                          navigate(`/ask/question/${expert.featured_answer.question_id}`);
                        }}
                      >
                        View Featured Answer
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ExpertProfileModal
        open={!!selectedExpert}
        onClose={() => setSelectedExpert(null)}
        expert={selectedExpert}
      />
    </>
  );
};
