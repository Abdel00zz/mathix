'use client';

import React from 'react';
import Link from 'next/link';
import type { ClassId } from '@/lib/types';
import { CLASS_LABELS, CLASS_META_LIST } from '@/lib/storage';
import { useApp } from './AppProvider';

const TABS: Array<{ id: 'learn' | 'examens' | 'problemes' | 'prepa'; href: string; label: string }> = [
  { id: 'learn', href: '/', label: 'Apprendre' },
  { id: 'examens', href: '/examens', label: 'Examens Nationaux' },
  { id: 'problemes', href: '/problemes', label: 'Problèmes' },
  { id: 'prepa', href: '/prepa', label: 'Prépa Concours' },
];

export function DashboardChrome({
  activeTab,
  serverClassTitle,
}: {
  activeTab: 'learn' | 'examens' | 'problemes' | 'prepa';
  serverClassTitle?: string;
}) {
  const { profile, updateProfile } = useApp();
  const firstName = profile.fn.trim() || 'Ali';
  const classTitle = serverClassTitle || CLASS_LABELS[profile.cls] || profile.cls;

  return (
    <>
      <div className="mf-greet" role="region" aria-label="Bannière élève">
        <div className="mf-greet-txt">
          <strong id="hi">Bonjour {firstName}</strong>
          <span className="mf-greet-sep" aria-hidden="true">&middot;</span>
          <span className="mf-greet-cls sub">{classTitle}</span>
          <span className="mf-greet-sep" aria-hidden="true">&middot;</span>
          <span>Une notion, un quiz, un pas de plus.</span>
        </div>
        <div className="mf-greet-act">
          <select
            className="mf-cls-picker"
            aria-label="Changer de filière"
            title="Changer de filière"
            value={profile.cls}
            onChange={(e) => updateProfile({ cls: e.target.value as ClassId })}
          >
            {CLASS_META_LIST.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mf-tabs-wrap">
        <nav className="mf-tabs-dock" aria-label="Rubriques principales">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="mf-tab-pill"
              aria-current={t.id === activeTab ? 'page' : undefined}
              prefetch
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
