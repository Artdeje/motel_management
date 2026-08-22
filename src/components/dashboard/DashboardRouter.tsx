import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { NavView } from '../layout/Sidebar';
import { ManagerDashboard } from './ManagerDashboard';
import { ChefDashboard } from './ChefDashboard';
import { WaiterDashboard } from './WaiterDashboard';
import { HousekeeperDashboard } from './HousekeeperDashboard';

interface DashboardRouterProps {
  onNavigate: (view: NavView) => void;
}

export const DashboardRouter: React.FC<DashboardRouterProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const role = user?.role || 'admin';

  if (role === 'chef') {
    return <ChefDashboard onNavigate={onNavigate} />;
  }

  if (role === 'waiter') {
    return <WaiterDashboard onNavigate={onNavigate} />;
  }

  if (role === 'housekeeper') {
    return <HousekeeperDashboard onNavigate={onNavigate} />;
  }

  // Admin & Manager see the comprehensive management operations dashboard
  return <ManagerDashboard onNavigate={onNavigate} />;
};
