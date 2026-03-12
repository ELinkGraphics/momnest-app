import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { InstallPrompt } from '../components/InstallPrompt';
import { AskQuestionForm } from '../components/ask/AskQuestionForm';
import { QuestionFeed } from '../components/ask/QuestionFeed';
import { ExpertAnswersCarousel } from '../components/ask/ExpertAnswersCarousel';
import { AnonymousStoryModal } from '../components/ask/AnonymousStoryModal';
import { SearchFilters } from '../components/ask/SearchFilters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';
import { type TabKey } from '@/hooks/useAppNav';
interface AskProps {
  activeTab: TabKey;
  onTabSelect: (tab: TabKey) => void;
  onOpenCreate: () => void;
}
const Ask: React.FC<AskProps> = ({
  activeTab,
  onTabSelect,
  onOpenCreate
}) => {
  const navigate = useNavigate();
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [activeQuestionTab, setActiveQuestionTab] = useState("recent");
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const handleViewExpertAnswer = (answerId: string) => {
    // Navigate to answer detail
    navigate(`/ask/question/${answerId}`);
  };
  return <div className="min-h-screen bg-background" data-testid="ask-page">
      <InstallPrompt />
      <Header />
      
      <main className="container mx-auto max-w-2xl px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Ask Anonymously
            </h1>
            <p className="text-muted-foreground text-sm">Get advice from our community without judgment</p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/ask/profile')}
            className="flex items-center gap-2"
          >
            <User className="h-4 w-4" />
            Profile
          </Button>
        </div>

        {/* Expert Answers Carousel */}
        <div className="mb-4 -mx-4">
          <ExpertAnswersCarousel onViewAnswer={handleViewExpertAnswer} />
        </div>

        {/* Ask Question Form Modal */}
        {showQuestionForm && <AskQuestionForm isOpen={showQuestionForm} onClose={() => setShowQuestionForm(false)} />}

        {/* Anonymous Story Modal */}
        {showStoryModal && <AnonymousStoryModal isOpen={showStoryModal} onClose={() => setShowStoryModal(false)} />}

        {/* Search and Filters */}
        <SearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Question Feed Tabs */}
        <Tabs value={activeQuestionTab} onValueChange={setActiveQuestionTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="unanswered">Unanswered</TabsTrigger>
            <TabsTrigger value="expert">Expert</TabsTrigger>
          </TabsList>
          
          <TabsContent value="recent" className="mt-6">
            <QuestionFeed filter="recent" searchQuery={searchQuery} categoryFilter={categoryFilter} />
          </TabsContent>
          
          <TabsContent value="trending" className="mt-6">
            <QuestionFeed filter="trending" searchQuery={searchQuery} categoryFilter={categoryFilter} />
          </TabsContent>
          
          <TabsContent value="unanswered" className="mt-6">
            <QuestionFeed filter="unanswered" searchQuery={searchQuery} categoryFilter={categoryFilter} />
          </TabsContent>

          <TabsContent value="expert" className="mt-6">
            <QuestionFeed filter="expert" searchQuery={searchQuery} categoryFilter={categoryFilter} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Floating Pin Button */}
      

      <FooterNav 
        active={activeTab} 
        onSelect={() => {}} // Navigation handled by FooterNav directly
        onOpenCreate={onOpenCreate}
        onOpenStoryModal={() => setShowStoryModal(true)}
        onOpenQuestionForm={() => setShowQuestionForm(true)}
      />
    </div>;
};
export default Ask;