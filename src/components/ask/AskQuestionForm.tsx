import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Send, AlertCircle, UserX, Edit3, BadgeCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateQuestion } from '@/hooks/useQuestions';
import { useIsExpert } from '@/hooks/useExpertProfiles';
import { supabase } from '@/integrations/supabase/client';

interface AskQuestionFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { value: 'parenting', label: 'Parenting & Child Care' },
  { value: 'health', label: 'Health & Wellness' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'career', label: 'Career & Work' },
  { value: 'mental-health', label: 'Mental Health' },
  { value: 'education', label: 'Education & Learning' },
  { value: 'lifestyle', label: 'Lifestyle & Personal' },
  { value: 'family', label: 'Family & Home' },
  { value: 'other', label: 'Other' }
];

const SUGGESTED_TAGS = [
  'urgent', 'advice-needed', 'first-time-mom', 'toddler', 'teenager', 
  'relationship-issues', 'work-life-balance', 'anxiety', 'depression',
  'pregnancy', 'newborn', 'school', 'discipline'
];

export const AskQuestionForm: React.FC<AskQuestionFormProps> = ({
  isOpen,
  onClose
}) => {
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [anonymousName, setAnonymousName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);
  const [isThread, setIsThread] = useState(false);
  const { toast } = useToast();
  const createQuestion = useCreateQuestion();
  const { data: isExpert } = useIsExpert();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAnonymous && isAuthenticated) {
      generateAnonymousName();
    } else {
      setAnonymousName('');
    }
  }, [isAnonymous, isAuthenticated]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setIsAuthenticated(!!user);
  };

  const generateAnonymousName = () => {
    const adjectives = ['Caring', 'Thoughtful', 'Curious', 'Brave', 'Kind', 'Wise', 'Hopeful', 'Strong', 'Gentle', 'Loving'];
    const nouns = ['Mom', 'Dad', 'Parent', 'Friend', 'Helper', 'Soul', 'Heart', 'Voice', 'Spirit', 'Light'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 999);
    setAnonymousName(`${randomAdj}${randomNoun}${randomNum}`);
  };

  const handleTagSelect = (tag: string) => {
    if (!tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag]);
    }
  };

  const handleTagRemove = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const generateAiSuggestion = async () => {
    if (!question.trim()) return;
    
    setShowAiSuggestion(true);
    // Simulate AI response - in real app, this would call an AI API
    setTimeout(() => {
      setAiSuggestion(
        "Based on your question, here are some immediate thoughts: This is a common concern many mothers face. Consider speaking with a professional if this is causing significant stress. Remember, you're doing your best and every situation is unique."
      );
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim() || !category) {
      toast({
        title: "Incomplete form",
        description: "Please fill in your question and select a category.",
        variant: "destructive"
      });
      return;
    }

    try {
      await createQuestion.mutateAsync({
        question: question.trim(),
        category,
        tags,
        isAnonymous: isExpert ? false : (isAuthenticated ? isAnonymous : true),
        anonymousName: (isAuthenticated && isAnonymous && !isExpert) ? anonymousName : undefined,
        isThread
      });
      
      setQuestion('');
      setCategory('');
      setTags([]);
      setAiSuggestion('');
      setShowAiSuggestion(false);
      setIsAnonymous(false);
      setIsThread(false);
      onClose();
    } catch (error) {
      console.error('Error submitting question:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" />
            Ask Your Question Anonymously
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Question Input */}
          <div className="space-y-2">
            <Label htmlFor="question">Your Question</Label>
            <Textarea
              id="question"
              placeholder="Describe your situation or question in detail. The more context you provide, the better advice you'll receive..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[120px] resize-none"
              required
            />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{question.length}/1000 characters</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={generateAiSuggestion}
                disabled={!question.trim() || showAiSuggestion}
                className="text-primary hover:text-primary/80"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Get AI Insight
              </Button>
            </div>
          </div>

          {/* AI Suggestion */}
          {showAiSuggestion && (
            <div className="p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg border border-primary/20">
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                <span className="text-sm font-medium text-primary">AI Insight</span>
              </div>
              {aiSuggestion ? (
                <p className="text-sm text-muted-foreground">{aiSuggestion}</p>
              ) : (
                <div className="space-y-2">
                  <div className="h-2 bg-muted rounded animate-pulse" />
                  <div className="h-2 bg-muted rounded animate-pulse w-3/4" />
                </div>
              )}
            </div>
          )}

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a category for better matching with experts" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (Optional)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {SUGGESTED_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant={tags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => tags.includes(tag) ? handleTagRemove(tag) : handleTagSelect(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Selected: {tags.join(', ')}
              </div>
            )}
          </div>

          {/* Thread Toggle */}
          {isAuthenticated && (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-primary/20">
              <div className="flex items-center gap-3">
                <Edit3 className="w-5 h-5 text-primary" />
                <div>
                  <Label htmlFor="thread-mode" className="text-sm font-medium cursor-pointer">
                    Create Thread Story
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Share an ongoing story you can update over time
                  </p>
                </div>
              </div>
              <Switch
                id="thread-mode"
                checked={isThread}
                onCheckedChange={setIsThread}
              />
            </div>
          )}

          {/* Expert Badge Notice */}
          {isAuthenticated && isExpert && (
            <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <BadgeCheck className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Posting as Verified Expert</p>
                <p className="text-xs text-muted-foreground">
                  Your expert badge will be shown. Experts cannot post anonymously.
                </p>
              </div>
            </div>
          )}

          {/* Anonymous Toggle (only for authenticated non-expert users) */}
          {isAuthenticated && !isExpert && (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-primary/20">
              <div className="flex items-center gap-3">
                <UserX className="w-5 h-5 text-primary" />
                <div>
                  <Label htmlFor="anonymous-mode" className="text-sm font-medium cursor-pointer">
                    Post Anonymously
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isAnonymous ? `Your name will be: ${anonymousName}` : 'Post with your account'}
                  </p>
                </div>
              </div>
              <Switch
                id="anonymous-mode"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
              />
            </div>
          )}

          {/* Anonymous Notice */}
          {!isAuthenticated && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                🔒 Your question will be posted anonymously. No personal information will be shared. 
                Our community experts and AI will provide helpful, judgment-free responses.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createQuestion.isPending}
              className="flex-1 bg-gradient-to-r from-primary to-secondary"
            >
              {createQuestion.isPending ? (
                <>
                  <video src="/loading-animation.mp4" autoPlay muted playsInline loop className="w-5 h-5 object-contain mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Ask Question
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};