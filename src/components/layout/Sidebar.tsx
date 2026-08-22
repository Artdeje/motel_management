import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import {
  LayoutDashboard,
  BedDouble,
  CalendarCheck,
  Users,
  Boxes,
  UtensilsCrossed,
  ConciergeBell,
  Receipt,
  ChefHat,
  Sparkles,
  DollarSign,
  BarChart3,
  ShieldCheck,
  Database,
  ClipboardList,
  FileSpreadsheet,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export type NavView =
  | 'dashboard'
  | 'waiter-dashboard'
  | 'rooms'
  | 'reservations'
  | 'guests'
  | 'inventory'
  | 'menu'
  | 'pos'
  | 'orders'
  | 'kitchen-orders'
  | 'housekeeping'
  | 'finance'
  | 'reports'
  | 'users'
  | 'audit-logs'
  | 'database'
  | 'cms-settings';

interface NavItem {
  id: NavView;
  label: string;
  icon: any;
  roles: UserRole[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'chef', 'housekeeper', 'waiter'] },
  
  // Front Desk & Rooms
  { id: 'rooms', label: 'Rooms & Front Desk', icon: BedDouble, roles: ['admin', 'manager'] },
  { id: 'reservations', label: 'Reservations', icon: CalendarCheck, roles: ['admin', 'manager'] },
  { id: 'guests', label: 'Guest Directory', icon: Users, roles: ['admin', 'manager'] },

  // Food & Beverage / POS
  { id: 'pos', label: 'Waiter POS', icon: ConciergeBell, roles: ['admin', 'waiter', 'manager'] },
  { id: 'orders', label: 'Orders Queue', icon: Receipt, roles: ['admin', 'manager', 'waiter'] },
  { id: 'kitchen-orders', label: 'Kitchen Orders', icon: ChefHat, roles: ['admin', 'manager', 'chef'] },
  { id: 'menu', label: 'Menu & Recipes', icon: UtensilsCrossed, roles: ['admin', 'manager', 'chef'] },

  // Inventory & Housekeeping
  { id: 'inventory', label: 'Central Inventory', icon: Boxes, roles: ['admin', 'manager', 'chef', 'waiter', 'housekeeper'] },
  { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles, roles: ['admin', 'manager', 'housekeeper'] },

  // Finance & Reporting
  { id: 'finance', label: 'Finance & Invoicing', icon: DollarSign, roles: ['admin', 'manager'] },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, roles: ['admin', 'manager'] },

  // Administration & Technical
  { id: 'users', label: 'User Accounts', icon: ShieldCheck, roles: ['admin'] },
  { id: 'audit-logs', label: 'Audit Trail', icon: ClipboardList, roles: ['admin'] },
  { id: 'database', label: 'MySQL Schema & DDL', icon: Database, roles: ['admin'] },
  { id: 'cms-settings', label: 'CMS Settings', icon: Settings, roles: ['admin'] },
];

interface SidebarProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onSelectView, collapsed, onToggleCollapse }) => {
  const { user } = useAuth();
  const currentRole = user?.role || 'admin';

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(currentRole));

  return (
    <aside
      className={`fixed left-0 top-16 bottom-0 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0 overflow-y-auto z-40 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <nav className="flex-1 px-2 pt-3 space-y-1 pb-6 overflow-x-hidden overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center w-full rounded-xl transition-all group ${
                collapsed ? 'justify-center px-0 py-3' : 'justify-between px-3 py-3'
              } ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 min-w-0'}`}>
                <Icon
                  className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-amber-400'
                  }`}
                />
                {!collapsed && (
                  <span className="truncate text-sm font-medium">{item.label}</span>
                )}
              </div>
              {!collapsed && item.badge && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${
                    isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Role hint — only when expanded */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/30">
          <div className="rounded-xl bg-slate-800/60 p-3 border border-slate-800 text-xs">
            <p className="font-semibold text-slate-200 capitalize flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {currentRole} Mode Active
            </p>
            <p className="text-slate-400 leading-snug">
              {currentRole === 'chef' && 'Deactivate out-of-stock items & monitor orders queue.'}
              {currentRole === 'waiter' && 'POS shows live stock servings with atomic reservations.'}
              {currentRole === 'housekeeper' && 'Track Dirty → Cleaning → Clean room lifecycle.'}
              {currentRole === 'manager' && 'Manage reservations, inventory requests & finance.'}
              {currentRole === 'admin' && 'Full system control, MySQL DDL schema & audit logs.'}
            </p>
          </div>
        </div>
      )}

      {/* Collapse / Expand toggle */}
      <div className="p-2 border-t border-slate-800/80 bg-slate-950/30">
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          {collapsed ? (
            <ChevronsRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronsLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};