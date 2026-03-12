import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CircleDetail from '@/pages/CircleDetail';
import { type TabKey } from '@/hooks/useAppNav';

const CircleDetailWrapper: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("circles");

  const handleTabSelect = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === "home") {
      navigate('/');
    } else if (tab === "circles") {
      navigate('/');
    } else if (tab === "ask") {
      // Handle ask anonymously functionality
      navigate('/');
    } else if (tab === "safe") {
      navigate('/');
    }
  };

  const handleOpenCreate = () => {
    navigate('/');
  };

  return (
    <CircleDetail
      activeTab={activeTab}
      onTabSelect={handleTabSelect}
      onOpenCreate={handleOpenCreate}
    />
  );
};

export default CircleDetailWrapper;