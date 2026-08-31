import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { UserRole } from '../../types';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  LogOut,
  Menu,
  Shield,
  User as UserIcon,
  Utensils,
  Sparkles,
  ConciergeBell,
  CheckCheck,
  Building2,
} from 'lucide-react';
import { formatNowCAT, formatTimeCAT } from '../../utils/dates';

const ROLE_CONFIG: Record<UserRole, { label: string; badgeClass: string; icon: any }> = {
  admin: { label: 'Administrator', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: Shield },
  manager: { label: 'General Manager', badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40', icon: Building2 },
  chef: { label: 'Kitchen Chef', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: Utensils },
  housekeeper: { label: 'Housekeeper', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: Sparkles },
  bartender: { label: 'Bartender', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: ConciergeBell },
};

interface NavbarProps {
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { user, switchRole, logout } = useAuth();
  const { getSetting } = useCms();
  const { info } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => setTimeStr(formatNowCAT());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const notifFailRef = useRef(0);

  const fetchNotifs = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications || []);
      notifFailRef.current = 0;
    } catch (e) {
      notifFailRef.current += 1;
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, notifFailRef.current > 2 ? 30000 : 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setShowRoleMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleRoleChange = async (role: UserRole) => {
    setShowRoleMenu(false);
    await switchRole(role);
    info('Role Switched', `You are now operating as ${ROLE_CONFIG[role].label}`);
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const currentRole = user?.role || 'admin';
  const roleMeta = ROLE_CONFIG[currentRole] || ROLE_CONFIG.admin;
  const RoleIcon = roleMeta.icon;

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold tracking-tighter text-xl">
          {getSetting('logo_text', 'GH')}
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
            {getSetting('site_title', 'Grand Horizon').split(' ').slice(0, -2).join(' ') || getSetting('site_title', 'Grand Horizon')}
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 hidden sm:inline-block">
              {getSetting('site_subtitle', 'Motel & Bistro')}
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="font-mono text-slate-300">{timeStr}</span>
            <span className="text-slate-400 hidden sm:inline">&bull;</span>
            <span className="hidden sm:inline">{getSetting('site_location', 'Kigali, Rwanda')}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative" ref={roleRef}>
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${roleMeta.badgeClass} hover:opacity-90 active:scale-95`}
          >
            <RoleIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Role:</span>
            <span className="hidden md:inline">{roleMeta.label}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50">
              <div className="px-3 py-2 border-b border-slate-800 mb-1">
                <p className="text-xs font-semibold text-slate-200">Switch Active Perspective</p>
                <p className="text-[11px] text-slate-400">Experience system per role permissions</p>
              </div>
              <div className="space-y-1">
                {(Object.keys(ROLE_CONFIG) as UserRole[]).map((rKey) => {
                  const rInfo = ROLE_CONFIG[rKey];
                  const Icon = rInfo.icon;
                  const isSelected = currentRole === rKey;
                  return (
                    <button
                      key={rKey}
                      onClick={() => handleRoleChange(rKey)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                        isSelected ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-slate-400" />
                        <div className="text-left">
                          <p className="font-semibold text-white">{rInfo.label}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{rKey} permissions</p>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center ring-2 ring-slate-900 animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">Notifications</p>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded-md">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">No notifications right now</div>
                ) : (
                  notifications.map((notif) => (
                    <div key={notif.id} className={`p-2.5 rounded-xl border text-xs transition-colors ${
                      notif.is_read ? 'bg-slate-950/40 border-slate-800/60 text-slate-400' : 'bg-slate-800/80 border-slate-700 text-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-white">{notif.title}</span>
                        <span className="text-[10px] text-slate-400">{formatTimeCAT(notif.created_at)}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">{notif.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-white leading-tight">{user?.full_name}</p>
            <p className="text-[10px] text-slate-400 capitalize">@{user?.username}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors ml-1"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
