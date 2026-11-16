import React, {
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useI18n } from '../../i18n/I18nContext';

export type DashboardTabId = 'chapitres' | 'examens' | 'problemes' | 'olympiad' | 'concours';

export interface DashboardSectionTab {
  id: DashboardTabId;
  title: string;
  show: boolean;
  color: string;
  bg: string;
  shortTitle?: string;
}

interface DashboardSectionTabsProps {
  tabs: DashboardSectionTab[];
  activeId?: DashboardTabId;
  onChange: (id: DashboardTabId) => void;
}

const DashboardSectionTabs: React.FC<DashboardSectionTabsProps> = ({
  tabs,
  activeId,
  onChange,
}) => {
  const { lang } = useI18n();
  const railRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const visibleTabs = useMemo(() => tabs.filter((tab) => tab.show), [tabs]);
  const activeTabId = visibleTabs.some((tab) => tab.id === activeId)
    ? activeId
    : visibleTabs[0]?.id;

  const activateTab = useCallback((id: DashboardTabId) => {
    buttonRefs.current[id]?.focus({ preventScroll: true });
    onChange(id);

    // Dynamic auto-centering mechanism
    const containerEl = railRef.current;
    const buttonEl = buttonRefs.current[id];
    if (containerEl && buttonEl) {
      const containerWidth = containerEl.clientWidth;
      const buttonLeft = buttonEl.offsetLeft;
      const buttonWidth = buttonEl.offsetWidth;
      
      const targetScroll = buttonLeft - (containerWidth / 2) + (buttonWidth / 2);
      containerEl.scrollTo({
        left: Math.max(0, Math.min(targetScroll, containerEl.scrollWidth - containerWidth)),
        behavior: 'smooth',
      });
    }
  }, [onChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = visibleTabs.length - 1;
    if (lastIndex < 0) return;

    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    activateTab(visibleTabs[nextIndex].id);
  }, [activateTab, visibleTabs]);

  if (visibleTabs.length <= 1) return null;

  return (
    <nav className="dashboard-tab-dock" aria-label={lang === 'ar' ? 'التنقل في لوحة المتابعة' : 'Navigation du dashboard'}>
      <div
        ref={railRef}
        className="dashboard-tab-dock__inner"
        role="tablist"
        aria-orientation="horizontal"
      >
        {visibleTabs.map((tab, index) => {
          const active = tab.id === activeTabId;
          return (
              <button
              key={tab.id}
              ref={(node) => {
                buttonRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              aria-label={tab.title}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`dashboard-tab-chip ${active ? 'dashboard-tab-chip--active' : ''}`}
              style={{ '--tab-color': tab.color } as React.CSSProperties}
              onClick={() => activateTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span className={`dashboard-tab-chip__title ${tab.shortTitle ? 'dashboard-tab-chip__title--has-short' : ''}`}>
                {tab.title}
              </span>
              {tab.shortTitle && (
                <span className="dashboard-tab-chip__title dashboard-tab-chip__title--short">
                  {tab.shortTitle}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default DashboardSectionTabs;
