import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import CircleCard from '@/components/circles/CircleCard';
import CircleManageModal from '@/components/circles/CircleManageModal';
import FooterNav from '@/components/FooterNav';
import { useCircles, useMyCircles, useOwnedCircles, Circle } from '@/hooks/useCircles';
import { useCircleMutations } from '@/hooks/useCircleMutations';
import { useUser } from '@/contexts/UserContext';
import { Skeleton } from '@/components/ui/skeleton';
import { CIRCLE_TYPES, CIRCLE_CATEGORIES } from '@/lib/circleTypes';
import { type TabKey } from '@/hooks/useAppNav';

interface CirclesProps {
  activeTab: TabKey;
  onTabSelect: (tab: TabKey) => void;
  onOpenCreate: () => void;
}

interface CircleFilters {
  category: string;
  type: string;
  pricing: 'all' | 'free' | 'paid';
  meeting: 'all' | 'online' | 'local';
}

const DEFAULT_FILTERS: CircleFilters = {
  category: 'all',
  type: 'all',
  pricing: 'all',
  meeting: 'all',
};

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const FilterChip: React.FC<FilterChipProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'border-border text-muted-foreground hover:border-primary/50'
    }`}
  >
    {children}
  </button>
);

const Circles: React.FC<CirclesProps> = ({ activeTab, onTabSelect, onOpenCreate }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');

  const [circleTab, setCircleTab] = useState('browse');
  const [manageCircle, setManageCircle] = useState<Circle | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<CircleFilters>(DEFAULT_FILTERS);

  const { data: allCircles = [], isLoading: isLoadingAll } = useCircles(user?.id);
  const { data: myCircles = [], isLoading: isLoadingMy } = useMyCircles(user?.id || '');
  const { data: ownedCircles = [], isLoading: isLoadingOwned } = useOwnedCircles(user?.id || '');
  const { joinCircle, isJoining } = useCircleMutations();

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== DEFAULT_FILTERS[key as keyof CircleFilters]
  ).length;

  const handleJoinCircle = (circleId: string, isPrivate: boolean) => {
    if (!user?.id) return;
    joinCircle(circleId, user.id, isPrivate);
  };

  const applyFilters = (circles: Circle[]) =>
    circles
      .filter((circle) =>
        circle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        circle.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        circle.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .filter((circle) => filters.category === 'all' || circle.category === filters.category)
      .filter((circle) => filters.type === 'all' || circle.circle_type === filters.type)
      .filter((circle) =>
        filters.pricing === 'all' ||
        (filters.pricing === 'paid' ? !!circle.subscription_enabled : !circle.subscription_enabled)
      )
      .filter((circle) =>
        filters.meeting === 'all' ||
        (filters.meeting === 'online' ? circle.is_online !== false : circle.is_online === false)
      );

  const filteredAllCircles = applyFilters(allCircles.filter((circle) => circle.creator_id !== user?.id));
  const filteredMyCircles = applyFilters(myCircles);
  const filteredOwnedCircles = applyFilters(ownedCircles);

  const hasQueryOrFilters = !!searchQuery || activeFilterCount > 0;

  return (
    <div className="min-h-[100dvh] w-full max-w-[480px] mx-auto bg-background text-foreground selection:bg-secondary/40 relative border-l border-r border-border font-sans overflow-x-hidden" data-testid="circles-page">
      {/* Header */}
      <header className="sticky top-0 left-0 right-0 z-50 bg-background backdrop-blur-md border-b border-border w-full">
        <div className="flex items-center gap-3 p-4">
         <h1 className="text-xl font-semibold text-foreground">Circles</h1>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search circles, topics, or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 transform -translate-y-1/2"
              onClick={() => setFiltersOpen(true)}
            >
              <div className="relative">
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </div>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-24">
        <Tabs value={circleTab} onValueChange={setCircleTab} className="w-full">
          <div className="px-4 mt-3">
            <TabsList className="grid w-full grid-cols-3 h-9 max-w-full">
              <TabsTrigger value="browse" className="text-xs px-1 min-w-0">Browse</TabsTrigger>
              <TabsTrigger value="my-circles" className="text-xs px-1 min-w-0">My Circles</TabsTrigger>
              <TabsTrigger value="my-communities" className="text-xs px-1 min-w-0">My Communities</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="browse" className="mt-4">
            <div className="px-4">
              <p className="text-xs text-muted-foreground mb-3">Discover and join circles created by others</p>
              <div className="grid gap-4">
                {isLoadingAll ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="h-48 w-full rounded-lg" />
                    </div>
                  ))
                ) : filteredAllCircles.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {hasQueryOrFilters ? 'No circles found matching your search' : 'No circles available yet'}
                  </div>
                ) : (
                  filteredAllCircles.map((circle) => (
                    <CircleCard
                      key={circle.id}
                      circle={circle}
                      onClick={() => navigate(`/circle/${circle.id}`)}
                      onJoin={handleJoinCircle}
                      isJoining={isJoining}
                    />
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="my-circles" className="mt-4">
            <div className="px-4">
              <p className="text-xs text-muted-foreground mb-3">Circles you've joined</p>
              <div className="grid gap-4">
                {isLoadingMy ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="h-48 w-full rounded-lg" />
                    </div>
                  ))
                ) : filteredMyCircles.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {hasQueryOrFilters ? 'No circles found matching your search' : "You haven't joined any circles yet"}
                  </div>
                ) : (
                  filteredMyCircles.map((circle) => (
                    <CircleCard
                      key={circle.id}
                      circle={circle}
                      onClick={() => navigate(`/circle/${circle.id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="my-communities" className="mt-4">
            <div className="px-4">
              <p className="text-xs text-muted-foreground mb-3">Circles you own or admin</p>
              <div className="grid gap-4">
                {isLoadingOwned ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="h-48 w-full rounded-lg" />
                    </div>
                  ))
                ) : filteredOwnedCircles.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {hasQueryOrFilters ? 'No circles found matching your search' : "You haven't created any circles yet"}
                  </div>
                ) : (
                  filteredOwnedCircles.map((circle) => (
                    <CircleCard
                      key={circle.id}
                      circle={circle}
                      onClick={() => navigate(`/circle/${circle.id}`)}
                      showManageButton
                      onManage={() => setManageCircle(circle)}
                    />
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Filters Sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80dvh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Filter circles</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 py-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Pricing</p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'free', 'paid'] as const).map((option) => (
                  <FilterChip
                    key={option}
                    active={filters.pricing === option}
                    onClick={() => setFilters((f) => ({ ...f, pricing: option }))}
                  >
                    {option === 'all' ? 'All' : option === 'free' ? 'Free' : 'Paid'}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">Circle type</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={filters.type === 'all'}
                  onClick={() => setFilters((f) => ({ ...f, type: 'all' }))}
                >
                  All
                </FilterChip>
                {CIRCLE_TYPES.map((type) => (
                  <FilterChip
                    key={type.id}
                    active={filters.type === type.id}
                    onClick={() => setFilters((f) => ({ ...f, type: type.id }))}
                  >
                    {type.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={filters.category === 'all'}
                  onClick={() => setFilters((f) => ({ ...f, category: 'all' }))}
                >
                  All
                </FilterChip>
                {CIRCLE_CATEGORIES.map((category) => (
                  <FilterChip
                    key={category}
                    active={filters.category === category}
                    onClick={() => setFilters((f) => ({ ...f, category }))}
                  >
                    {category}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">Where</p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'online', 'local'] as const).map((option) => (
                  <FilterChip
                    key={option}
                    active={filters.meeting === option}
                    onClick={() => setFilters((f) => ({ ...f, meeting: option }))}
                  >
                    {option === 'all' ? 'All' : option === 'online' ? 'Online' : 'Local'}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pb-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              disabled={activeFilterCount === 0}
            >
              Clear all
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Show results
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Manage Modal */}
      {manageCircle && (
        <CircleManageModal
          circle={manageCircle}
          open={!!manageCircle}
          onOpenChange={(open) => { if (!open) setManageCircle(null); }}
        />
      )}

      {/* Footer Navigation */}
      <FooterNav
        active={activeTab}
        onSelect={onTabSelect}
        onOpenCreate={onOpenCreate}
      />
    </div>
  );
};

export default Circles;
