import React, { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { CmsProvider, useCms } from './context/CmsContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavView } from './components/layout/Sidebar';
import { LoginPage } from './components/auth/LoginPage';
import { DashboardRouter } from './components/dashboard/DashboardRouter';
import { RoomManagement } from './components/rooms/RoomManagement';
import { ReservationManager } from './components/rooms/ReservationManager';
import { GuestDirectory } from './components/guests/GuestDirectory';
import { WaiterPOS } from './components/pos/WaiterPOS';
import { OrderManager } from './components/orders/OrderManager';
import { KitchenMenuControl } from './components/kitchen/KitchenMenuControl';
import { KitchenOrdersView } from './components/kitchen/KitchenOrdersView';
import { InventoryManager } from './components/inventory/InventoryManager';
import { HousekeepingView } from './components/housekeeping/HousekeepingView';
import { FinanceDashboard } from './components/finance/FinanceDashboard';
import { ReportsView } from './components/reports/ReportsView';
import { UserManagement } from './components/admin/UserManagement';
import { AuditLogViewer } from './components/admin/AuditLogViewer';
import { DatabaseSchemaViewer } from './components/admin/DatabaseSchemaViewer';
import { SystemSettings } from './components/admin/SystemSettings';
import { Loader2 } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { getSetting } = useCms();
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <h2 className="text-base font-bold text-white tracking-wide">{getSetting('site_title', 'GRAND HORIZON MOTEL & BISTRO')}</h2>
        <p className="text-xs text-slate-400 mt-1">{getSetting('loading_subtitle', 'Initializing operational engines & RBAC permissions...')}</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleSelectView = (view: NavView) => {
    setCurrentView(view);
    setSidebarOpen(false);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardRouter onNavigate={setCurrentView} />;
      case 'rooms':
        return <RoomManagement />;
      case 'reservations':
        return <ReservationManager />;
      case 'guests':
        return <GuestDirectory />;
      case 'pos':
        return <WaiterPOS />;
      case 'orders':
        return <OrderManager />;
      case 'kitchen-orders':
        return <KitchenOrdersView />;
      case 'menu':
        return <KitchenMenuControl />;
      case 'inventory':
        return <InventoryManager />;
      case 'housekeeping':
        return <HousekeepingView />;
      case 'finance':
        return <FinanceDashboard />;
      case 'reports':
        return <ReportsView />;
      case 'users':
        return <UserManagement />;
      case 'audit-logs':
        return <AuditLogViewer />;
      case 'database':
        return <DatabaseSchemaViewer />;
      case 'cms-settings':
        return <SystemSettings />;
      default:
        return <DashboardRouter onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          currentView={currentView}
          onSelectView={handleSelectView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 transform transition-transform">
            <Sidebar
              currentView={currentView}
              onSelectView={handleSelectView}
              collapsed={false}
              onToggleCollapse={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 min-h-0 lg:h-full transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        {currentView === 'pos' ? (
          <div className="h-full overflow-hidden">
            {renderView()}
          </div>
        ) : (
          <main className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              {renderView()}
            </div>
          </main>
        )}

        {/* Footer */}
        {currentView !== 'pos' && (
          <footer className="border-t border-slate-800 bg-slate-900/40 px-4 sm:px-6 lg:px-8 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-slate-500">
              <span>&copy; {new Date().getFullYear()} {getSetting('site_title', 'Grand Horizon Motel & Bistro')}</span>
              <span>{getSetting('footer_text', 'All rights reserved')} &bull; {getSetting('developer_name', 'Grand Horizon Dev Team')}</span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CmsProvider>
          <MainAppContent />
          <Analytics />
        </CmsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
