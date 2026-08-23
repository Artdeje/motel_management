import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, getStoredToken } from '../api/client';

interface CmsSettings {
  [key: string]: string;
}

interface CmsContextValue {
  settings: CmsSettings;
  getSetting: (key: string, fallback?: string) => string;
  refreshSettings: () => Promise<void>;
  loading: boolean;
}

const FALLBACKS: Record<string, string> = {
  site_title: 'Grand Horizon Motel & Bistro',
  site_subtitle: 'Motel & Bistro',
  logo_text: 'GH',
  favicon_url: '',
  logo_url: '',
  site_description: 'Full-service motel management platform',
  loading_subtitle: 'Initializing operational engines & RBAC permissions...',
  site_location: 'Kigali, Rwanda',
  developer_name: 'Grand Horizon Dev Team',
  footer_text: 'All rights reserved',
};

const CmsContext = createContext<CmsContextValue>({
  settings: FALLBACKS,
  getSetting: (key, fallback) => fallback || FALLBACKS[key] || '',
  refreshSettings: async () => {},
  loading: true,
});

export const useCms = () => useContext(CmsContext);

function applyFavicon(url: string) {
  if (!url) return;
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

function applyTitle(title: string) {
  if (title) {
    document.title = title;
  }
}

export const CmsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<CmsSettings>(FALLBACKS);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  const loadSettings = useCallback(async () => {
    try {
      // Public endpoint — works before login (dynamic branding) and after login (authenticated)
      const res = await api.getSettings();
      const fetched = res.settings || {};
      setSettings((prev) => ({ ...prev, ...fetched }));

      applyTitle(fetched.site_title || FALLBACKS.site_title);
      if (fetched.favicon_url) applyFavicon(fetched.favicon_url);
    } catch {
      // Settings unavailable — use defaults silently (API may be unreachable during SSG)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      loadSettings();
    }
  }, [loadSettings]);

  const getSetting = useCallback(
    (key: string, fallback?: string) => {
      return settings[key] || fallback || FALLBACKS[key] || '';
    },
    [settings]
  );

  return (
    <CmsContext.Provider value={{ settings, getSetting, refreshSettings: loadSettings, loading }}>
      {children}
    </CmsContext.Provider>
  );
};
