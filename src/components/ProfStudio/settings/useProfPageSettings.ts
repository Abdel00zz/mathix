import { useEffect, useState } from 'react';
import { profContentService, type ClassChapter } from '../../../services/profContentService';
import type { UserProfile } from '../../../types';
import {
  DEFAULT_NOTIFY_TEMPLATES,
  resolveNotifyTemplates,
  type NotifyTemplate,
} from '../notifyTemplates';
import { DEFAULT_BANNER_MESSAGE } from './settingsUi';

interface UseProfPageSettingsOptions {
  isOpen: boolean;
  classId?: string;
  profPage?: UserProfile['profPage'];
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
}

export function useProfPageSettings({ isOpen, classId, profPage, onUpdateProfile }: UseProfPageSettingsOptions) {
  const [pageMessage, setPageMessage] = useState(profPage?.bannerMessage || '');
  const [pageHighlighted, setPageHighlighted] = useState<Set<string>>(
    () => new Set(profPage?.highlightedChapterIds || []),
  );
  const [pageChapters, setPageChapters] = useState<ClassChapter[]>([]);
  const [pageChaptersLoading, setPageChaptersLoading] = useState(false);
  const [notifyTemplates, setNotifyTemplates] = useState<NotifyTemplate[]>(
    () => resolveNotifyTemplates(profPage?.notifyTemplates),
  );

  useEffect(() => {
    if (!isOpen || !classId) return;
    let active = true;
    void (async () => {
      setPageChaptersLoading(true);
      try {
        const classes = await profContentService.fetchClasses();
        const currentClass = classes.find(candidate => candidate.id === classId);
        if (!currentClass) return;
        const overrides = await profContentService.fetchOverrides();
        const chapters = await profContentService.fetchClassChapters(currentClass, overrides);
        if (active) setPageChapters(chapters);
      } catch {
        // La grille reste vide si le contenu n'est pas disponible.
      } finally {
        if (active) setPageChaptersLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen, classId]);

  useEffect(() => {
    if (!isOpen || !onUpdateProfile) return;
    const timer = window.setTimeout(() => {
      onUpdateProfile({
        profPage: {
          bannerMessage: pageMessage.trim() || DEFAULT_BANNER_MESSAGE,
          highlightedChapterIds: Array.from(pageHighlighted),
          notifyTemplates,
        },
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [isOpen, pageMessage, pageHighlighted, notifyTemplates, onUpdateProfile]);

  const togglePageChapter = (id: string) => {
    setPageHighlighted(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patchTemplate = (index: number, updates: Partial<NotifyTemplate>) => {
    setNotifyTemplates(previous => previous.map((template, templateIndex) => (
      templateIndex === index ? { ...template, ...updates } : template
    )));
  };

  const addTemplate = () => {
    setNotifyTemplates(previous => [
      ...previous,
      { key: `tpl_${Date.now().toString(36)}`, title: '', body: '' },
    ]);
  };

  const removeTemplate = (index: number) => {
    setNotifyTemplates(previous => previous.filter((_, templateIndex) => templateIndex !== index));
  };

  const resetTemplates = () => {
    setNotifyTemplates(DEFAULT_NOTIFY_TEMPLATES.map(template => ({ ...template })));
  };

  return {
    pageMessage,
    setPageMessage,
    pageHighlighted,
    pageChapters,
    pageChaptersLoading,
    notifyTemplates,
    togglePageChapter,
    patchTemplate,
    addTemplate,
    removeTemplate,
    resetTemplates,
  };
}
