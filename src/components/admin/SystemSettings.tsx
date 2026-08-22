import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useCms } from '../../context/CmsContext';
import {
  Settings,
  Save,
  Trash2,
  Plus,
  RotateCcw,
  Loader2,
  Globe,
  Image,
  Type,
  FileText,
  Tag,
  Palette,
  MapPin,
  Users,
  AlertTriangle,
} from 'lucide-react';

interface SettingEntry {
  key_name: string;
  value: string;
  description: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

const KEY_META: Record<string, { label: string; icon: any; placeholder: string }> = {
  site_title: { label: 'Site Title', icon: Globe, placeholder: 'Grand Horizon Motel & Bistro' },
  site_subtitle: { label: 'Site Subtitle (Badge)', icon: Tag, placeholder: 'Motel & Bistro' },
  logo_text: { label: 'Logo Abbreviation', icon: Type, placeholder: 'GH' },
  favicon_url: { label: 'Favicon URL', icon: Image, placeholder: 'https://example.com/favicon.ico' },
  logo_url: { label: 'Logo Image URL', icon: Image, placeholder: 'https://example.com/logo.png' },
  site_description: { label: 'Site Description', icon: FileText, placeholder: 'Full-service motel management platform' },
  loading_subtitle: { label: 'Loading Screen Subtitle', icon: Palette, placeholder: 'Initializing operational engines...' },
  site_location: { label: 'Site Location', icon: MapPin, placeholder: 'Kigali, Rwanda' },
  developer_name: { label: 'Developer / Team Name', icon: Users, placeholder: 'Grand Horizon Dev Team' },
  footer_text: { label: 'Footer Copyright Text', icon: FileText, placeholder: 'All rights reserved' },
};

export const SystemSettings: React.FC = () => {
  const { refreshSettings } = useCms();
  const { info, success, error: toastError } = useToast();
  const [entries, setEntries] = useState<SettingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getSettings();
      const settings = res.settings || {};
      const fetched: SettingEntry[] = Object.entries(settings).map(([key, val]) => ({
        key_name: key,
        value: String(val),
        description: KEY_META[key]?.placeholder || '',
      }));
      setEntries(fetched);
    } catch (e: any) {
      toastError('Load Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateEntry = (key: string, field: 'key_name' | 'value' | 'description', val: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.key_name === key ? { ...e, [field]: val } : e))
    );
  };

  const addNewEntry = () => {
    setEntries((prev) => [...prev, { key_name: '', value: '', description: '', isNew: true }]);
  };

  const markDelete = (key: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.key_name === key ? { ...e, isDeleted: true } : e))
    );
    setConfirmDelete(null);
  };

  const undoDelete = (key: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.key_name === key ? { ...e, isDeleted: false } : e))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete removed entries
      const deleted = entries.filter((e) => e.isDeleted && !e.isNew);
      for (const d of deleted) {
        await api.deleteSetting(d.key_name);
      }

      // Save active entries
      const active = entries.filter((e) => !e.isDeleted && e.key_name.trim());
      const settingsPayload: Record<string, { value: string; description?: string }> = {};
      for (const a of active) {
        settingsPayload[a.key_name.trim()] = {
          value: a.value,
          ...(a.description ? { description: a.description } : {}),
        };
      }

      await api.updateSettings(settingsPayload);
      await refreshSettings();
      success('Settings Saved', `${Object.keys(settingsPayload).length} settings updated`);
      fetchSettings();
    } catch (e: any) {
      toastError('Save Failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const activeEntries = entries.filter((e) => !e.isDeleted);
  const deletedEntries = entries.filter((e) => e.isDeleted && !e.isNew);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Loading CMS settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-400" />
            CMS System Settings
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage site title, logo, favicon, and all branding content. Changes apply system-wide.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSettings}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reload
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {activeEntries.map((entry) => {
          const meta = KEY_META[entry.key_name] || { label: entry.key_name, icon: Settings, placeholder: '' };
          const Icon = meta.icon;
          const isConfirming = confirmDelete === entry.key_name;

          return (
            <div
              key={entry.key_name || 'new-' + Math.random()}
              className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-amber-400" />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={entry.key_name}
                      onChange={(e) => updateEntry(entry.key_name, 'key_name', e.target.value)}
                      placeholder="setting_key"
                      disabled={!entry.isNew}
                      className={`text-xs font-mono px-3 py-1.5 rounded-lg border ${
                        entry.isNew
                          ? 'bg-slate-800 border-slate-600 text-amber-300 focus:border-amber-400'
                          : 'bg-slate-800/50 border-slate-800 text-slate-400 cursor-not-allowed'
                      } focus:outline-none w-48`}
                    />
                    <span className="text-xs text-slate-500">{meta.label}</span>
                  </div>

                  <input
                    value={entry.value}
                    onChange={(e) => updateEntry(entry.key_name, 'value', e.target.value)}
                    placeholder={meta.placeholder}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />

                  <input
                    value={entry.description}
                    onChange={(e) => updateEntry(entry.key_name, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 placeholder:text-slate-600 focus:outline-none focus:border-slate-600 transition-colors"
                  />
                </div>

                <div className="shrink-0">
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => markDelete(entry.key_name)}
                        className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-semibold hover:bg-rose-500/30"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(entry.key_name)}
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      title="Delete setting"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {deletedEntries.length > 0 && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4">
          <p className="text-sm font-semibold text-rose-300 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Pending Deletions ({deletedEntries.length})
          </p>
          <div className="space-y-1">
            {deletedEntries.map((e) => (
              <div key={e.key_name} className="flex items-center justify-between text-xs">
                <span className="text-rose-200 font-mono">{e.key_name}</span>
                <button
                  onClick={() => undoDelete(e.key_name)}
                  className="text-slate-400 hover:text-white underline"
                >
                  Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={addNewEntry}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-300 transition-colors text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add New Setting
      </button>
    </div>
  );
};
