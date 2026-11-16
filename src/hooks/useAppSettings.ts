import { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_REVISION_BLOCK_VISIBILITY, DEFAULT_REVISION_BLOCK_NUMBERING, DEFAULT_READING_THEME, createDefaultAppSettings } from '../utils/constants';
import { resolveReadingTheme } from '../utils/readingTheme';

const DEFAULT_SETTINGS: AppSettings = createDefaultAppSettings();

const PAPER_THEME_COLORS: Record<string, string> = {
  ivoire: '#f5f0e8',
  blanc: '#f8fafc',
  creme: '#fdf8ec',
  ardoise: '#334155',
};

export function useAppSettings() {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('mathplus_settings');
      if (!saved) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        revisionBlockVisibility: {
          ...DEFAULT_REVISION_BLOCK_VISIBILITY,
          ...(parsed.revisionBlockVisibility || {}),
        },
        revisionBlockNumbering: {
          ...DEFAULT_REVISION_BLOCK_NUMBERING,
          ...(parsed.revisionBlockNumbering || {}),
        },
        readingTheme: {
          ...DEFAULT_READING_THEME,
          ...(parsed.readingTheme || {}),
        },
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Persist & apply font-size + thème de lecture
  useEffect(() => {
    localStorage.setItem('mathplus_settings', JSON.stringify(appSettings));

    const root = document.documentElement;
    if (appSettings.fontSize === 'sm') root.style.fontSize = '14px';
    else if (appSettings.fontSize === 'lg') root.style.fontSize = '17px';
    else root.style.fontSize = '15px';

    const reading = resolveReadingTheme(appSettings);
    root.dataset.readingPaper = reading.paper;
    root.dataset.readingFont = reading.docFont;
    root.style.setProperty('--reading-doc-scale', String(reading.docScale));

    // Thème clair unique : pas de variante sombre à appliquer.
    root.style.colorScheme = 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER_THEME_COLORS[reading.paper] || '#f5f0e8');
  }, [appSettings]);

  // Cross-tab sync
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'mathplus_settings' || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue);
        setAppSettings(prev => ({
          ...prev,
          ...parsed,
          revisionBlockVisibility: {
            ...DEFAULT_REVISION_BLOCK_VISIBILITY,
            ...(parsed.revisionBlockVisibility || {}),
          },
          revisionBlockNumbering: {
            ...DEFAULT_REVISION_BLOCK_NUMBERING,
            ...(parsed.revisionBlockNumbering || {}),
          },
          readingTheme: {
            ...DEFAULT_READING_THEME,
            ...(parsed.readingTheme || {}),
          },
        }));
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleApplySettings = useCallback((newSettings: AppSettings) => {
    setAppSettings({
      ...DEFAULT_SETTINGS,
      ...newSettings,
      revisionBlockVisibility: {
        ...DEFAULT_REVISION_BLOCK_VISIBILITY,
        ...(newSettings.revisionBlockVisibility || {}),
      },
      revisionBlockNumbering: {
        ...DEFAULT_REVISION_BLOCK_NUMBERING,
        ...(newSettings.revisionBlockNumbering || {}),
      },
      readingTheme: {
        ...DEFAULT_READING_THEME,
        ...(newSettings.readingTheme || {}),
      },
    });
  }, []);

  return { appSettings, handleApplySettings };
}
