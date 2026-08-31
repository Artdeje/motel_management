import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../types';
import {
  ShieldCheck,
  Search,
  Plus,
  UserCheck,
  UserX,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Edit2,
  Trash2
} from 'lucide-react';
import { formatDateCAT } from '../../utils/dates';

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { success, error } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDrop, setUserToDrop] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    phone: '',
    role: 'bartender',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      error('Failed to load users', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      return handleUpdateUser(e);
    }

    if (!form.username || !form.password || !form.full_name) {
      return error('Username, password, and full name are required');
    }

    setSubmitting(true);
    try {
      await api.createUser(form);
      success('Staff User Account Created Successfully');
      setShowAddModal(false);
      setForm({
        username: '',
        password: '',
        full_name: '',
        email: '',
        phone: '',
        role: 'bartender',
      });
      fetchUsers();
    } catch (err: any) {
      error('Failed to create user', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      password: '',
      full_name: u.full_name,
      email: u.email || '',
      phone: u.phone || '',
      role: u.role,
    });
    setShowAddModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const payload: any = {
      username: form.username.trim(),
      full_name: form.full_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      role: form.role,
    };
    if (form.password) {
      payload.password = form.password;
    }

    setSubmitting(true);
    try {
      await api.updateUser(editingUser.id, payload);
      success('Staff Account Updated Successfully');
      setShowAddModal(false);
      setEditingUser(null);
      setForm({
        username: '',
        password: '',
        full_name: '',
        email: '',
        phone: '',
        role: 'bartender',
      });
      fetchUsers();
    } catch (err: any) {
      error('Failed to update user', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDropUser = async () => {
    if (!userToDrop) return;
    setSubmitting(true);
    try {
      await api.deleteUser(userToDrop.id);
      success('Staff Account Deactivated', `${userToDrop.full_name} can no longer sign in.`);
      setUserToDrop(null);
      fetchUsers();
    } catch (err: any) {
      error('Drop failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'manager':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'chef':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'bartender':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'housekeeper':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Staff Accounts & Access Control</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Role-Based Access Control (RBAC): Administrator, Manager, Kitchen Chef, Housekeeper & bartender.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-transform active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, username, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500"
          />
        </div>
        <span className="text-xs text-slate-400 font-semibold">{filtered.length} Staff Users</span>
      </div>

      {/* Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="p-3.5">Name</th>
                <th className="p-3.5">Username</th>
                <th className="p-3.5">Assigned Role</th>
                <th className="p-3.5">Contact</th>
                <th className="p-3.5">Account Status</th>
                <th className="p-3.5">Created At</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3.5 font-bold text-white">{u.full_name}</td>
                  <td className="p-3.5 font-mono text-amber-400">@{u.username}</td>
                  <td className="p-3.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getRoleBadge(
                        u.role
                      )}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-400">
                    <p className="text-slate-200">{u.phone || 'No phone'}</p>
                    <p className="text-[10px]">{u.email || 'No email'}</p>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.is_active === 1 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {u.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-400">
                    {formatDateCAT(u.created_at)}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEditUser(u)}
                        className="p-1.5 text-slate-400 hover:text-purple-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Edit account details / role / password"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {currentUser?.id !== u.id && (
                        <button
                          onClick={() => setUserToDrop(u)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title={u.is_active === 1 ? 'Deactivate (Drop) account' : 'Account already inactive'}
                          disabled={u.is_active !== 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              {editingUser ? `Edit Staff Account — ${editingUser.full_name}` : 'Create Staff Account'}
            </h3>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="e.g. chef_john"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {editingUser ? 'New Password (optional)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser ? 'Leave blank to keep current' : '••••••••'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required={!editingUser}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Bosco Habimana"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Role / Job Position</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="bartender">bartender (Table & Room Service POS)</option>
                  <option value="chef">Kitchen Chef (Food Orders & Item Deactivation)</option>
                  <option value="housekeeper">Housekeeper (Room Cleaning & Maintenance)</option>
                  <option value="manager">Manager (Front Desk, Approvals & Operations)</option>
                  <option value="admin">Administrator (Full System Control & Users)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+250 788 123 456"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="staff@motel.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (editingUser ? 'Updating...' : 'Creating...') : editingUser ? 'Update Account' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop User Confirmation Modal */}
      {userToDrop && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <UserX className="w-5 h-5 text-rose-400" />
              Deactivate "{userToDrop.full_name}"
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              This account (@{userToDrop.username}, currently <span className="text-white font-semibold uppercase">{userToDrop.role}</span>)
              will be deactivated immediately. The staff member will no longer be able to sign in,
              but their historical activity (orders, attendance, check-ins) is preserved.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-800">
              <button
                onClick={() => setUserToDrop(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDropUser}
                disabled={submitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              >
                {submitting ? 'Deactivating...' : 'Deactivate Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
