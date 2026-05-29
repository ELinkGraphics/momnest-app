import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PersistentCommentComposer } from '@/components/PersistentCommentComposer';
import { useAnswers, useCreateAnswer, useAnswerVote, useUpdateAnswer, useDeleteAnswer } from '@/hooks/useAnswers';
import { useQuestion, useQuestionVote, useUserVotes, useUpdateQuestion, useDeleteQuestion } from '@/hooks/useQuestions';
import { useThreadUpdates, useCreateThreadUpdate, useUpdateThreadUpdate, useDeleteThreadUpdate } from '@/hooks/useThreadUpdates';
import { useIsQuestionBookmarked, useToggleQuestionBookmark } from '@/hooks/useQuestionBookmarks';
import { supabase } from '@/integrations/supabase/client';
import anonymousLogo from '@/assets/anonymous-logo.png';
import { 
  ThumbsUp, 
  MessageCircle, 
  Sparkles,
  Share2,
  Bookmark,
  Loader2,
  ArrowLeft,
  Edit3,
  CheckCircle2,
  BadgeCheck,
  Pencil,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function QuestionDetail() {
  const { questionId } = useParams<{ questionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: question, isLoading: questionLoading } = useQuestion(questionId || '');
  const { data: answers, isLoading: answersLoading } = useAnswers(questionId || '');
  const { data: threadUpdates, isLoading: threadLoading } = useThreadUpdates(questionId || '');
  const { data: userVotes } = useUserVotes();
  const createAnswer = useCreateAnswer();
  const createThreadUpdate = useCreateThreadUpdate();
  const updateThreadUpdate = useUpdateThreadUpdate();
  const deleteThreadUpdate = useDeleteThreadUpdate();
  const voteOnAnswer = useAnswerVote();
  const voteOnQuestion = useQuestionVote();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const updateAnswer = useUpdateAnswer();
  const deleteAnswer = useDeleteAnswer();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [answerVoteCounts, setAnswerVoteCounts] = useState<Record<string, number>>({});
  const [questionVoteCount, setQuestionVoteCount] = useState(0);
  const [showThreadForm, setShowThreadForm] = useState(false);
  const [threadUpdate, setThreadUpdate] = useState('');
  const [questionAuthorIsExpert, setQuestionAuthorIsExpert] = useState(false);
  const [questionAuthorProfile, setQuestionAuthorProfile] = useState<any>(null);
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editedQuestionText, setEditedQuestionText] = useState('');
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [editedAnswerText, setEditedAnswerText] = useState('');
  const [editingThreadUpdateId, setEditingThreadUpdateId] = useState<string | null>(null);
  const [editedThreadUpdateText, setEditedThreadUpdateText] = useState('');

  // Bookmark functionality
  const { data: isBookmarked = false } = useIsQuestionBookmarked(questionId, currentUser?.id);
  const toggleBookmark = useToggleQuestionBookmark();

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setCurrentUserProfile(profile);
      }
    };
    fetchCurrentUser();
  }, []);

  // Check if question author is an expert and fetch their profile
  useEffect(() => {
    if (!question?.user_id) return;
    const checkExpert = async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from('expert_profiles')
        .select('is_verified')
        .eq('user_id', question.user_id)
        .eq('is_verified', true)
        .maybeSingle();
      
      if (data?.is_verified) {
        setQuestionAuthorIsExpert(true);
        const { data: profile } = await sb
          .from('profiles')
          .select('id, username, name, avatar_url, initials, avatar_color')
          .eq('id', question.user_id)
          .single();
        setQuestionAuthorProfile(profile);
      }
    };
    checkExpert();
  }, [question?.user_id]);

  useEffect(() => {
    setEditedQuestionText(question?.question || '');
  }, [question?.question]);

  // Fetch initial vote counts
  useEffect(() => {
    const fetchVoteCounts = async () => {
      if (!questionId) return;

      // Fetch question votes
      const { data: qVotes } = await (supabase as any)
        .from('question_votes')
        .select('id')
        .eq('question_id', questionId);
      setQuestionVoteCount(qVotes?.length || 0);

      // Fetch answer votes
      if (answers && answers.length > 0) {
        const answerIds = answers.map((a: any) => a.id);
        const { data: aVotes } = await (supabase as any)
          .from('answer_votes')
          .select('answer_id')
          .in('answer_id', answerIds);

        const counts: Record<string, number> = {};
        aVotes?.forEach((vote: any) => {
          counts[vote.answer_id] = (counts[vote.answer_id] || 0) + 1;
        });
        setAnswerVoteCounts(counts);
      }
    };
    fetchVoteCounts();
  }, [questionId, answers]);

  // Real-time subscription for answers
  useEffect(() => {
    if (!questionId) return;

    const channel = supabase
      .channel(`answers:${questionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'answers',
          filter: `question_id=eq.${questionId}`
        },
        () => {
          // Answers will auto-refresh via useQuery
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [questionId]);

  // Real-time subscription for question votes
  useEffect(() => {
    if (!questionId) return;

    const channel = supabase
      .channel(`question_votes:${questionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'question_votes',
          filter: `question_id=eq.${questionId}`
        },
        async () => {
          const { data: qVotes } = await (supabase as any)
            .from('question_votes')
            .select('id')
            .eq('question_id', questionId);
          setQuestionVoteCount(qVotes?.length || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [questionId]);

  // Real-time subscription for answer votes
  useEffect(() => {
    if (!questionId || !answers || answers.length === 0) return;

    const channel = supabase
      .channel(`answer_votes:${questionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'answer_votes'
        },
        async (payload) => {
          // Refresh vote counts for the specific answer
          const answerIds = answers.map((a: any) => a.id);
          const { data: aVotes } = await (supabase as any)
            .from('answer_votes')
            .select('answer_id')
            .in('answer_id', answerIds);

          const counts: Record<string, number> = {};
          aVotes?.forEach((vote: any) => {
            counts[vote.answer_id] = (counts[vote.answer_id] || 0) + 1;
          });
          setAnswerVoteCounts(counts);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [questionId, answers]);

  // Real-time subscription for thread updates
  useEffect(() => {
    if (!questionId || !question?.is_thread) return;

    const channel = supabase
      .channel(`thread_updates:${questionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'thread_updates',
          filter: `question_id=eq.${questionId}`
        },
        () => {
          // Thread updates will auto-refresh via useQuery
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [questionId, question?.is_thread]);

  const handleSubmitAnswer = async (answerText: string) => {
    try {
      await createAnswer.mutateAsync({
        questionId: questionId || '',
        answer: answerText,
      });
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

  const handleQuestionVote = async () => {
    if (!currentUser || !questionId) {
      toast({
        title: "Sign in required",
        description: "Please sign in to vote",
        variant: "destructive"
      });
      return;
    }

    const hasVoted = userVotes?.questions?.includes(questionId);
    await voteOnQuestion.mutateAsync({ questionId, hasVoted: !!hasVoted });
  };

  const handleAnswerVote = async (answerId: string) => {
    if (!currentUser || !questionId) {
      toast({
        title: "Sign in required",
        description: "Please sign in to vote",
        variant: "destructive"
      });
      return;
    }

    const hasVoted = userVotes?.answers?.includes(answerId);
    await voteOnAnswer.mutateAsync({ answerId, hasVoted: !!hasVoted, questionId });
  };

  const handleContinueThread = () => {
    setShowThreadForm(true);
  };

  const handleSubmitThreadUpdate = async () => {
    if (!threadUpdate.trim() || !questionId) return;

    try {
      await createThreadUpdate.mutateAsync({
        questionId,
        content: threadUpdate.trim()
      });
      setThreadUpdate('');
      setShowThreadForm(false);
      toast({
        title: "Thread updated",
        description: "Your story update has been posted",
      });
    } catch (error) {
      console.error('Error posting thread update:', error);
    }
  };

  const handleSaveQuestionEdit = async () => {
    if (!questionId || !editedQuestionText.trim() || !question) return;

    await updateQuestion.mutateAsync({
      questionId,
      question: editedQuestionText.trim(),
      category: question.category,
      tags: question.tags || [],
    });

    setIsEditingQuestion(false);
  };

  const handleDeleteQuestion = async () => {
    if (!questionId) return;
    const confirmed = window.confirm('Delete this ask? This cannot be undone.');
    if (!confirmed) return;

    await deleteQuestion.mutateAsync(questionId);
    navigate('/ask');
  };

  const handleSaveAnswerEdit = async (answerId: string) => {
    if (!questionId || !editedAnswerText.trim()) return;

    await updateAnswer.mutateAsync({
      answerId,
      questionId,
      answer: editedAnswerText.trim(),
    });

    setEditingAnswerId(null);
    setEditedAnswerText('');
  };

  const handleDeleteAnswer = async (answerId: string) => {
    if (!questionId) return;
    const confirmed = window.confirm('Delete this comment?');
    if (!confirmed) return;

    await deleteAnswer.mutateAsync({ answerId, questionId });
  };

  const handleSaveThreadUpdateEdit = async (updateId: string) => {
    if (!questionId || !editedThreadUpdateText.trim()) return;

    await updateThreadUpdate.mutateAsync({
      updateId,
      questionId,
      content: editedThreadUpdateText.trim(),
    });

    setEditingThreadUpdateId(null);
    setEditedThreadUpdateText('');
  };

  const handleDeleteThreadUpdate = async (updateId: string) => {
    if (!questionId) return;
    const confirmed = window.confirm('Delete this story update?');
    if (!confirmed) return;

    await deleteThreadUpdate.mutateAsync({ updateId, questionId });
  };

  const handleMarkHelpful = async (answerId: string) => {
    if (!currentUser || !isQuestionAuthor) {
      toast({
        title: "Not authorized",
        description: "Only question authors can mark answers as helpful",
        variant: "destructive"
      });
      return;
    }

    try {
      await (supabase as any)
        .from('answers')
        .update({ is_helpful: true })
        .eq('id', answerId);
      
      toast({
        title: "Marked as helpful",
        description: "This answer has been marked as helpful",
      });
    } catch (error) {
      console.error('Error marking answer as helpful:', error);
      toast({
        title: "Error",
        description: "Failed to mark answer as helpful",
        variant: "destructive"
      });
    }
  };

  const handleToggleBookmark = async () => {
    if (!currentUser || !questionId) {
      toast({
        title: "Sign in required",
        description: "Please sign in to bookmark questions",
        variant: "destructive"
      });
      return;
    }

    try {
      await toggleBookmark.mutateAsync({
        questionId,
        userId: currentUser.id,
        isBookmarked
      });
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  if (questionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-xl font-semibold mb-2">Question not found</h2>
        <Button onClick={() => navigate('/ask')}>Back to Ask</Button>
      </div>
    );
  }

  const isQuestionAuthor = currentUser && question.user_id === currentUser.id;
  const questionIsAnonymous = question.is_anonymous;

  // Determine display name for current user in composer
  let displayName: string | undefined;
  let displayAvatar: string | undefined;
  let displayColor: string | undefined;

  if (isQuestionAuthor && questionIsAnonymous) {
    displayName = question.anonymous_name || 'Anonymous';
    displayColor = '#4B164C';
  } else if (currentUserProfile) {
    displayName = currentUserProfile.initials;
    displayAvatar = currentUserProfile.avatar_url;
    displayColor = currentUserProfile.avatar_color;
  }

  const hasVotedQuestion = userVotes?.questions?.includes(questionId || '');

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/ask')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: question?.title || '', url: window.location.href }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast({ title: 'Link copied to clipboard' });
                }
              }}
            >
              <Share2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleToggleBookmark}
              className={isBookmarked ? 'text-primary' : ''}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Question Header */}
        <div className="space-y-4">
          {/* Asker info */}
          <div className="flex items-center gap-3">
            {questionAuthorIsExpert && questionAuthorProfile ? (
              <div 
                className="size-10 rounded-full grid place-items-center text-xs font-medium text-white overflow-hidden border-2 border-primary/30"
                style={{ backgroundColor: questionAuthorProfile.avatar_color }}
              >
                {questionAuthorProfile.avatar_url ? (
                  <img src={questionAuthorProfile.avatar_url} alt={questionAuthorProfile.name} className="w-full h-full object-cover" />
                ) : (
                  questionAuthorProfile.initials
                )}
              </div>
            ) : (
              <img 
                src={anonymousLogo} 
                alt="Asker" 
                className="w-10 h-10 rounded-full border-2 border-border"
              />
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {questionAuthorIsExpert && questionAuthorProfile
                    ? questionAuthorProfile.name
                    : question.is_anonymous 
                      ? (question.anonymous_name || 'Anonymous') 
                      : 'User'}
                </span>
                {questionAuthorIsExpert && (
                  <BadgeCheck className="w-4 h-4 text-primary" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(question.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>

          {isEditingQuestion ? (
            <div className="space-y-2">
              <textarea
                value={editedQuestionText}
                onChange={(e) => setEditedQuestionText(e.target.value)}
                className="w-full min-h-[120px] p-3 bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  setIsEditingQuestion(false);
                  setEditedQuestionText(question.question || '');
                }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveQuestionEdit} disabled={!editedQuestionText.trim() || updateQuestion.isPending}>
                  Save Ask
                </Button>
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-semibold text-foreground leading-relaxed">
              {question.question}
            </h1>
          )}

          {isQuestionAuthor && !isEditingQuestion && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditingQuestion(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit Ask
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeleteQuestion} disabled={deleteQuestion.isPending}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete Ask
              </Button>
            </div>
          )}

          {/* Tags */}
          {question.tags && question.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {question.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <Button
              variant="ghost"
              size="sm"
              className={`h-auto p-0 ${hasVotedQuestion ? 'text-primary' : 'text-muted-foreground'} hover:text-primary`}
              onClick={handleQuestionVote}
            >
              <ThumbsUp className={`w-4 h-4 mr-1 ${hasVotedQuestion ? 'fill-current' : ''}`} />
              {questionVoteCount}
            </Button>
            <div className="flex items-center gap-1 text-muted-foreground">
              <MessageCircle className="w-4 h-4" />
              {answers?.length || 0} opinions
            </div>
          </div>
        </div>

        {/* AI Response */}
        {question.ai_response && (
          <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg p-4 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-medium text-primary">AI Insight</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {question.ai_response}
            </p>
          </div>
        )}

        {/* Thread Updates */}
        {question.is_thread && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary" />
                  Story Updates
                </h2>
                {isQuestionAuthor && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleContinueThread}
                  >
                    Continue Story
                  </Button>
                )}
              </div>

              {showThreadForm && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <textarea
                    value={threadUpdate}
                    onChange={(e) => setThreadUpdate(e.target.value)}
                    placeholder="Share your story update..."
                    className="w-full min-h-[100px] p-3 bg-background rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowThreadForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm"
                      onClick={handleSubmitThreadUpdate}
                      disabled={!threadUpdate.trim()}
                    >
                      Post Update
                    </Button>
                  </div>
                </div>
              )}

              {threadLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {threadUpdates && threadUpdates.length > 0 ? (
                <div className="space-y-3">
                  {threadUpdates.map((update: any, index: number) => {
                    const isOwnerUpdate = currentUser?.id === update.user_id;
                    const isEditingThisUpdate = editingThreadUpdateId === update.id;

                    return (
                      <div key={update.id} className="p-4 bg-muted/30 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              Update #{index + 1}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {isOwnerUpdate && !isEditingThisUpdate && (
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                                setEditingThreadUpdateId(update.id);
                                setEditedThreadUpdateText(update.update_text || '');
                              }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleDeleteThreadUpdate(update.id)} disabled={deleteThreadUpdate.isPending}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {isEditingThisUpdate ? (
                          <div className="space-y-2">
                            <textarea
                              value={editedThreadUpdateText}
                              onChange={(e) => setEditedThreadUpdateText(e.target.value)}
                              className="w-full min-h-[90px] p-3 bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => {
                                setEditingThreadUpdateId(null);
                                setEditedThreadUpdateText('');
                              }}>
                                Cancel
                              </Button>
                              <Button size="sm" onClick={() => handleSaveThreadUpdateEdit(update.id)} disabled={!editedThreadUpdateText.trim() || updateThreadUpdate.isPending}>
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed">{update.update_text}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                !threadLoading && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No updates yet
                  </p>
                )
              )}
            </div>
          </>
        )}

        <Separator />

        {/* Answers Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {!answers || answers.length === 0 
              ? 'No opinions yet' 
              : `${answers.length} Opinion${answers.length === 1 ? '' : 's'}`}
          </h2>

          {answersLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {answers?.map((answer: any) => {
            const isAnswerByQuestionAuthor = answer.user_id === question.user_id;
            const showAnonymousName = isAnswerByQuestionAuthor && questionIsAnonymous;
            
            let answerDisplayName = 'Anonymous';
            let answerAvatar = '/src/assets/anonymous-logo.png';
            let answerColor = '#4B164C';

            if (showAnonymousName) {
              answerDisplayName = question.anonymous_name || 'Anonymous (OP)';
              answerAvatar = anonymousLogo;
              answerColor = '#4B164C';
            } else if (answer.profile) {
              answerDisplayName = answer.profile.name || answer.profile.username || 'User';
              answerAvatar = answer.profile.avatar_url || answerAvatar;
              answerColor = answer.profile.avatar_color || answerColor;
            }

            const hasVotedAnswer = userVotes?.answers?.includes(answer.id);
            const voteCount = answerVoteCounts[answer.id] || 0;

            return (
              <div key={answer.id} className="p-4 bg-muted/30 rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="size-10 rounded-full grid place-items-center text-xs font-medium text-white overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: answerColor }}
                    >
                      {showAnonymousName ? (
                        <img src={anonymousLogo} alt="Anonymous" className="w-full h-full object-cover" />
                      ) : answer.profile?.avatar_url ? (
                        <img src={answer.profile.avatar_url} alt={answerDisplayName} className="w-full h-full object-cover" />
                      ) : (
                        <img src={answerAvatar} alt={answerDisplayName} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">
                          {answerDisplayName}
                          {showAnonymousName && ' (OP)'}
                        </span>
                        {answer.isExpert && (
                          <div className="flex items-center gap-1">
                            <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                              Expert
                            </Badge>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(answer.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={`${hasVotedAnswer ? 'text-primary' : 'text-muted-foreground'} hover:text-primary`}
                      onClick={() => handleAnswerVote(answer.id)}
                    >
                      <ThumbsUp className={`w-4 h-4 mr-1 ${hasVotedAnswer ? 'fill-current' : ''}`} />
                      {voteCount}
                    </Button>

                    {answer.user_id === currentUser?.id && editingAnswerId !== answer.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => {
                            setEditingAnswerId(answer.id);
                            setEditedAnswerText(answer.answer || '');
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleDeleteAnswer(answer.id)}
                          disabled={deleteAnswer.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                
                {editingAnswerId === answer.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedAnswerText}
                      onChange={(e) => setEditedAnswerText(e.target.value)}
                      className="w-full min-h-[90px] p-3 bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingAnswerId(null);
                          setEditedAnswerText('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveAnswerEdit(answer.id)}
                        disabled={!editedAnswerText.trim() || updateAnswer.isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{answer.answer}</p>
                )}
                
                <div className="flex items-center gap-2">
                  {answer.is_helpful && (
                    <Badge variant="outline" className="text-xs">
                      ✅ Marked as helpful
                    </Badge>
                  )}
                  {isQuestionAuthor && !answer.is_helpful && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleMarkHelpful(answer.id)}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Mark as helpful
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Persistent Comment Composer */}
      <PersistentCommentComposer
        onSubmit={handleSubmitAnswer}
        placeholder="Share your opinion..."
        displayName={displayName}
        displayAvatar={displayAvatar}
        displayColor={displayColor}
      />
    </div>
  );
}