import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollTriggeredAIInsight } from './ScrollTriggeredAIInsight';
import { ExpertProfileModal } from './ExpertProfileModal';
import { useQuestionVote, useUserVotes } from '@/hooks/useQuestions';
import { useExpertProfiles } from '@/hooks/useExpertProfiles';
import anonymousLogo from '@/assets/anonymous-logo.png';
import { 
  ThumbsUp, 
  MessageCircle, 
  AlertTriangle,
  TrendingUp,
  BadgeCheck
} from 'lucide-react';

interface Question {
  id: string;
  question: string;
  category: string;
  tags: string[];
  timestamp: string;
  answerCount: number;
  upvotes: number;
  voteCount?: number;
  isUrgent: boolean;
  hasExpertAnswer: boolean;
  aiResponse?: string;
  isThread?: boolean;
  threadUpdates?: number;
  lastUpdate?: string;
  is_anonymous?: boolean;
  anonymous_name?: string;
  isExpert?: boolean;
  expertUserId?: string;
  expertProfile?: {
    username: string;
    name: string;
    avatar_url?: string;
    initials?: string;
    avatar_color?: string;
  } | null;
  profiles?: {
    username: string;
    name: string;
  };
}

interface QuestionCardProps {
  question: Question;
  onClick: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ question, onClick }) => {
  const navigate = useNavigate();
  const voteOnQuestion = useQuestionVote();
  const { data: userVotes } = useUserVotes();
  const hasVoted = userVotes?.questions?.includes(question.id);
  const [selectedExpert, setSelectedExpert] = useState<any>(null);
  const { data: allExperts } = useExpertProfiles(50);

  const handleClick = () => {
    navigate(`/ask/question/${question.id}`);
  };
  
  const handleUpvote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await voteOnQuestion.mutateAsync({ 
      questionId: question.id, 
      hasVoted: !!hasVoted 
    });
  };

  const handleExpertNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (question.isExpert && question.expertUserId && allExperts) {
      const expert = allExperts.find((ex: any) => ex.user_id === question.expertUserId);
      if (expert) {
        setSelectedExpert(expert);
      }
    }
  };

  return (
    <>
      <Card 
        className="cursor-pointer shadow-sm border-l-4 border-l-primary/20 border-r-4 border-r-primary/20 hover:border-l-primary hover:shadow-lg transition-all duration-200"
        onClick={handleClick}
      >
        <CardContent className="p-4">
          {/* Asker Profile */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              {question.isExpert && question.expertProfile ? (
                <Avatar
                  className="w-8 h-8 border-2 border-primary/30 cursor-pointer"
                  onClick={handleExpertNameClick}
                >
                  <AvatarImage src={question.expertProfile.avatar_url} />
                  <AvatarFallback 
                    className="text-xs text-white"
                    style={{ backgroundColor: question.expertProfile.avatar_color }}
                  >
                    {question.expertProfile.initials}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <img 
                  src={anonymousLogo} 
                  alt={question.is_anonymous ? "Anonymous Asker" : "User"} 
                  className="w-8 h-8 rounded-full border-2 border-border"
                />
              )}
              {question.isUrgent && (
                <div className="absolute -bottom-0.5 -right-0.5 px-1 py-0.5 bg-destructive text-destructive-foreground text-[7px] font-bold rounded-full border border-background shadow-sm animate-slide-in-right">
                  URG
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-timestamp font-medium text-foreground ${question.isExpert ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                  onClick={question.isExpert ? handleExpertNameClick : undefined}
                >
                  {question.isExpert && question.expertProfile
                    ? question.expertProfile.name
                    : question.is_anonymous 
                      ? (question.anonymous_name || 'Anonymous') 
                      : 'User'}
                </span>
                {question.isExpert && (
                  <div className="flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                    <Badge className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-primary/20">
                      Expert
                    </Badge>
                  </div>
                )}
              </div>
              <span className="text-timestamp text-muted-foreground">{question.timestamp}</span>
            </div>
          </div>

          {/* Thread Updates Only */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {question.isThread && (
                <div className="flex items-center text-primary text-sm">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  {question.threadUpdates} update{question.threadUpdates !== 1 ? 's' : ''} • {question.lastUpdate}
                </div>
              )}
            </div>
            {question.isUrgent && (
              <Badge variant="destructive" className="animate-pulse">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Urgent
              </Badge>
            )}
          </div>

          {/* Question content */}
          <p className="text-foreground text-post-content mb-3 line-clamp-3 leading-relaxed">
            {question.question}
          </p>

          {/* Tags */}
          {question.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {question.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-badge">
                  #{tag}
                </Badge>
              ))}
              {question.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{question.tags.length - 3} more
                </Badge>
              )}
            </div>
          )}

          {/* AI Response Preview */}
          {question.aiResponse && (
            <div className="mb-3">
              <ScrollTriggeredAIInsight content={question.aiResponse} />
            </div>
          )}

          {/* Footer with stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-auto p-0 hover:text-primary ${hasVoted ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={handleUpvote}
              >
                <ThumbsUp className={`w-4 h-4 mr-1 ${hasVoted ? 'fill-current' : ''}`} />
                {question.voteCount ?? question.upvotes ?? 0}
              </Button>
              
              <div className="flex items-center text-muted-foreground text-meta-info">
                <MessageCircle className="w-4 h-4 mr-1" />
                {question.answerCount} {question.answerCount === 1 ? 'opinion' : 'opinions'}
              </div>
            </div>

            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary hover:text-primary/80"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
            >
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExpertProfileModal
        open={!!selectedExpert}
        onClose={() => setSelectedExpert(null)}
        expert={selectedExpert}
      />
    </>
  );
};
