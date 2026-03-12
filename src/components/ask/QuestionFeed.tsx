import React from 'react';
import { QuestionCard } from './QuestionCard';
import { useQuestions } from '@/hooks/useQuestions';
import { VideoLoader } from '@/components/ui/VideoLoader';
import { formatDistanceToNow } from 'date-fns';

interface Question {
  [key: string]: any;
  id: string;
  question: string;
  category: string;
  tags: string[];
  timestamp: string;
  answerCount: number;
  upvotes: number;
  isUrgent: boolean;
  hasExpertAnswer: boolean;
  aiResponse?: string;
  answers: Answer[];
  isThread?: boolean;
  threadUpdates?: number;
  lastUpdate?: string;
  is_anonymous?: boolean;
  anonymous_name?: string;
  user_id?: string;
  created_at?: string;
  profiles?: {
    username: string;
    name: string;
  };
  threadData?: {
    canContinue: boolean;
    updates: Array<{
      id: string;
      content: string;
      timestamp: string;
      upvotes: number;
      isOriginalPoster: boolean;
    }>;
  };
}

interface Answer {
  id: string;
  content: string;
  isExpert: boolean;
  expertTitle?: string;
  upvotes: number;
  timestamp: string;
  isHelpful: boolean;
}

interface QuestionFeedProps {
  filter: 'recent' | 'trending' | 'unanswered' | 'expert';
  searchQuery?: string;
  categoryFilter?: string;
}

export const QuestionFeed: React.FC<QuestionFeedProps> = ({ filter, searchQuery, categoryFilter }) => {
  const { data: questions, isLoading } = useQuestions(filter, 0, 20, searchQuery, categoryFilter);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <VideoLoader size="md" />
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <span className="text-2xl">💭</span>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          No questions found
        </h3>
        <p className="text-muted-foreground text-sm">
          {filter === 'unanswered' 
            ? "All questions have been answered!" 
            : "Be the first to ask a question in this category."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q: any) => {
        const formattedQuestion: Question = {
          id: q.id,
          question: q.question,
          category: q.category,
          tags: q.tags || [],
          timestamp: formatDistanceToNow(new Date(q.created_at), { addSuffix: true }),
          answerCount: q.answerCount || 0,
          upvotes: q.voteCount || 0,
          isUrgent: false,
          hasExpertAnswer: !!q.ai_response,
          aiResponse: q.ai_response,
          is_anonymous: q.isExpert ? false : q.is_anonymous, // Experts are never anonymous
          anonymous_name: q.anonymous_name,
          user_id: q.user_id,
          created_at: q.created_at,
          isThread: q.is_thread || false,
          isExpert: q.isExpert || false,
          expertProfile: q.expertProfile || null,
          expertUserId: q.isExpert ? q.user_id : undefined,
          answers: []
        };
        
        return (
          <QuestionCard
            key={q.id}
            question={formattedQuestion}
            onClick={() => {}}
          />
        );
      })}
    </div>
  );
};