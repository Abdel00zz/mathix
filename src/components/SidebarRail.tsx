'use client';

import React from 'react';
import { Compass, HelpCircle, Settings } from 'lucide-react';
import { useApp } from './AppProvider';

export function SidebarRail() {
  const { profile, activeModal, setActiveModal } = useApp();
  const fn = profile.fn.trim();

  return (
    <aside id="mf-sidebar" className="mf-sidebar" aria-label="Outils et paramètres">
      <div className="mf-sb-tools">
        <button
          type="button"
          className="mf-sb-item"
          data-sb-action="orientation"
          data-active={activeModal === 'orientation' ? 'true' : undefined}
          onClick={() => setActiveModal('orientation')}
          title="Orientation & Programme officiel"
        >
          <span className="mf-sb-ic"><Compass size={19} strokeWidth={2} aria-hidden="true" /></span>
          <span className="mf-sb-lbl">Orientation</span>
        </button>

        <button
          type="button"
          className="mf-sb-item"
          id="av-side"
          data-sb-action="settings"
          data-active={activeModal === 'settings' ? 'true' : undefined}
          onClick={() => setActiveModal('settings')}
          title="Paramètres"
          aria-label="Paramètres"
        >
          <span className="mf-sb-ic"><Settings size={19} strokeWidth={2} aria-hidden="true" /></span>
          <span className="mf-sb-lbl" id="mf-sb-name">{fn ? `Paramètres · ${fn}` : 'Paramètres'}</span>
        </button>
      </div>

      <div className="mf-sb-foot">
        <button
          type="button"
          className="mf-sb-item"
          data-sb-action="help"
          data-active={activeModal === 'help' ? 'true' : undefined}
          onClick={() => setActiveModal('help')}
          title="Aide & Raccourcis"
        >
          <span className="mf-sb-ic"><HelpCircle size={19} strokeWidth={2} aria-hidden="true" /></span>
          <span className="mf-sb-lbl">Aide</span>
        </button>
      </div>
    </aside>
  );
}
