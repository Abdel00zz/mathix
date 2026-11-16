'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import type { ClassId, DocFontPref, StudentProfile, ThemePref } from '@/lib/types';
import { CLASS_META_LIST } from '@/lib/storage';
import { useApp } from './AppProvider';
import { CloudAccountBox } from './CloudAccountBox';

const OrientationModal = dynamic(() => import('./OrientationModal').then((m) => m.OrientationModal));

export function ModalsHost() {
  const { profile, activeModal, setActiveModal, updateProfile, resetProgress } = useApp();
  const setRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const mobRef = useRef<HTMLDialogElement>(null);

  const [draft, setDraft] = useState<StudentProfile>(profile);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (activeModal === 'settings') {
      setDraft(profile);
      setConfirmReset(false);
    }
  }, [activeModal, profile]);

  useEffect(() => {
    const map: Array<[HTMLDialogElement | null, boolean]> = [
      [setRef.current, activeModal === 'settings'],
      [helpRef.current, activeModal === 'help'],
      [mobRef.current, activeModal === 'mobileMenu'],
    ];
    for (const [dlg, shouldOpen] of map) {
      if (!dlg) continue;
      if (shouldOpen && !dlg.open) dlg.showModal();
      else if (!shouldOpen && dlg.open) dlg.close();
    }
  }, [activeModal]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile(draft);
    setActiveModal(null);
  };

  return (
    <>
      {activeModal === 'orientation' ? <OrientationModal /> : null}

      <dialog
        ref={setRef}
        id="set"
        aria-label="Paramètres élève"
        onClose={() => { if (activeModal === 'settings') setActiveModal(null); }}
        onClick={(e) => { if (e.target === setRef.current) setActiveModal(null); }}
      >
        <form id="sf" className="set-shell" onSubmit={handleSaveSettings}>
          <header className="set-head">
            <div className="set-head-meta">
              <h2>Paramètres</h2>
              <p className="set-subtitle">Apparence, profil élève et options d’étude</p>
            </div>
            <button
              type="button"
              className="set-close"
              aria-label="Fermer les paramètres"
              onClick={() => setActiveModal(null)}
            >
              <X size={18} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </header>

          <div className="set-body">
            <section className="set-card" aria-labelledby="set-sec-look">
              <h3 className="set-sec-title" id="set-sec-look">Apparence &amp; Lecture</h3>
              <div className="set-theme-group" role="radiogroup" aria-label="Thème de l'interface">
                {([['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']] as Array<[ThemePref, string]>).map(([val, lbl]) => (
                  <label key={val} className="set-theme-pill">
                    <input
                      type="radio"
                      name="th"
                      value={val}
                      checked={draft.th === val}
                      onChange={() => setDraft((d) => ({ ...d, th: val }))}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>

              <div className="set-grid-2">
                <label className="fld">
                  Police des cours
                  <select
                    name="docFont"
                    value={draft.docFont}
                    onChange={(e) => setDraft((d) => ({ ...d, docFont: e.target.value as DocFontPref }))}
                  >
                    <option value="literata">Literata (Sérif)</option>
                    <option value="sans">Hanken Grotesk (Sans)</option>
                  </select>
                </label>
                <label className="fld">
                  Taille du texte
                  <select
                    name="docScale"
                    value={String(draft.docScale)}
                    onChange={(e) => setDraft((d) => ({ ...d, docScale: parseFloat(e.target.value) || 1 }))}
                  >
                    <option value="0.95">95 %</option>
                    <option value="1">100 %</option>
                    <option value="1.1">110 %</option>
                    <option value="1.2">120 %</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="set-card" aria-labelledby="set-sec-prefs">
              <h3 className="set-sec-title" id="set-sec-prefs">Confort &amp; Accessibilité</h3>
              <div className="set-switch-list">
                <label className="set-switch-row">
                  <span>
                    <strong>Tiers-temps (+33&nbsp;%) sur les quiz</strong>
                    <small>Allonge automatiquement le minuteur de chaque question</small>
                  </span>
                  <span className="set-switch">
                    <input
                      type="checkbox"
                      checked={draft.tiersTemps}
                      onChange={(e) => setDraft((d) => ({ ...d, tiersTemps: e.target.checked }))}
                    />
                    <span className="set-switch-track" aria-hidden="true" />
                  </span>
                </label>

                <label className="set-switch-row">
                  <span>
                    <strong>Effets sonores discrets</strong>
                    <small>Retours acoustiques lors des validations et réussites</small>
                  </span>
                  <span className="set-switch">
                    <input
                      type="checkbox"
                      checked={draft.soundEnabled}
                      onChange={(e) => setDraft((d) => ({ ...d, soundEnabled: e.target.checked }))}
                    />
                    <span className="set-switch-track" aria-hidden="true" />
                  </span>
                </label>

                <label className="set-switch-row">
                  <span>
                    <strong>Surlignage du lexique mathématique</strong>
                    <small>Termes clés cliquables avec définition FR / AR dans les leçons</small>
                  </span>
                  <span className="set-switch">
                    <input
                      type="checkbox"
                      checked={draft.lexiconAutoHighlight}
                      onChange={(e) => setDraft((d) => ({ ...d, lexiconAutoHighlight: e.target.checked }))}
                    />
                    <span className="set-switch-track" aria-hidden="true" />
                  </span>
                </label>

                <label className="set-switch-row">
                  <span>
                    <strong>Réduire les animations</strong>
                    <small>Désactive les transitions de vue et défilements doux</small>
                  </span>
                  <span className="set-switch">
                    <input
                      type="checkbox"
                      checked={draft.reduceMotion}
                      onChange={(e) => setDraft((d) => ({ ...d, reduceMotion: e.target.checked }))}
                    />
                    <span className="set-switch-track" aria-hidden="true" />
                  </span>
                </label>
              </div>
            </section>

            <section className="set-card" aria-labelledby="set-sec-profile">
              <h3 className="set-sec-title" id="set-sec-profile">Profil élève</h3>
              <label className="fld">
                Filière
                <select
                  name="cls"
                  value={draft.cls}
                  onChange={(e) => setDraft((d) => ({ ...d, cls: e.target.value as ClassId }))}
                >
                  {CLASS_META_LIST.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </label>

              <div className="set-grid-2">
                <label className="fld">
                  Prénom
                  <input
                    name="fn"
                    autoComplete="given-name"
                    placeholder="Votre prénom"
                    value={draft.fn}
                    onChange={(e) => setDraft((d) => ({ ...d, fn: e.target.value }))}
                  />
                </label>

                <label className="fld">
                  Nom
                  <input
                    name="ln"
                    autoComplete="family-name"
                    placeholder="Votre nom"
                    value={draft.ln}
                    onChange={(e) => setDraft((d) => ({ ...d, ln: e.target.value }))}
                  />
                </label>
              </div>

              <label className="fld" style={{ marginBottom: 0 }}>
                Établissement
                <input
                  name="sc"
                  placeholder="Nom de votre lycée"
                  value={draft.sc}
                  onChange={(e) => setDraft((d) => ({ ...d, sc: e.target.value }))}
                />
              </label>
            </section>

            <section className="set-card" aria-labelledby="set-sec-cloud">
              <h3 className="set-sec-title" id="set-sec-cloud">Compte &amp; Sauvegarde Cloud</h3>
              <CloudAccountBox />
            </section>
          </div>

          <footer className="set-foot">
            <button
              type="button"
              className={`btn set-reset-btn${confirmReset ? ' is-confirming' : ''}`}
              id="rst"
              onClick={() => {
                if (confirmReset) {
                  resetProgress();
                  setConfirmReset(false);
                  setActiveModal(null);
                } else {
                  setConfirmReset(true);
                }
              }}
            >
              {confirmReset ? 'Confirmer la réinitialisation' : 'Réinitialiser ma progression'}
            </button>
            <div className="set-foot-end">
              <button type="button" className="btn ghost" onClick={() => setActiveModal(null)}>
                Annuler
              </button>
              <button type="submit" className="btn primary">
                Enregistrer
              </button>
            </div>
          </footer>
        </form>
      </dialog>

      <dialog
        ref={helpRef}
        id="help-dlg"
        aria-label="Aide du cahier Apprendre"
        onClose={() => { if (activeModal === 'help') setActiveModal(null); }}
        onClick={(e) => { if (e.target === helpRef.current) setActiveModal(null); }}
      >
        <div>
          <header className="set-head set-head-compact">
            <h2>Aide — Cahier Apprendre</h2>
            <button type="button" className="set-close" aria-label="Fermer l’aide" onClick={() => setActiveModal(null)}>
              <X size={18} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </header>
          <div className="mf-dlg-list">
            <div className="mf-dlg-card">
              <strong>Progression guidée</strong>
              <p>Complétez 10 % d’une leçon pour débloquer son quiz : révélez les réponses des blancs proposés. Traitez ensuite 15 % du quiz, ou soumettez-le, pour débloquer les exercices. Sans quiz, les exercices sont accessibles directement.</p>
            </div>
            <div className="mf-dlg-card">
              <strong>Raccourcis clavier (Quiz, Leçon &amp; Exercices)</strong>
              <p>Touches A/B/C/D ou 1–4 pour choisir, V/F pour Vrai/Faux, ←/→ entre exercices, double-clic sur un bloc de leçon pour l’agrandir.</p>
            </div>
            <div className="mf-dlg-card">
              <strong>Mode hors-ligne &amp; Impression</strong>
              <p>Les pages déjà consultées et enregistrées restent accessibles sans connexion. Ouvrez vos fiches en ligne avant de partir ; les images externes peuvent nécessiter Internet. Le bouton Imprimer adapte chaque sujet au format papier A4.</p>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => setActiveModal(null)}>
              Compris
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={mobRef}
        id="mobile-menu-dlg"
        aria-label="Outils"
        onClose={() => { if (activeModal === 'mobileMenu') setActiveModal(null); }}
        onClick={(e) => { if (e.target === mobRef.current) setActiveModal(null); }}
      >
        <div>
          <header className="set-head set-head-compact">
            <h2>Outils</h2>
            <button type="button" className="set-close" aria-label="Fermer le menu" onClick={() => setActiveModal(null)}>
              <X size={18} strokeWidth={2.1} aria-hidden="true" />
            </button>
          </header>
          <div className="mf-menu-sheet">
            <button type="button" className="btn" onClick={() => setActiveModal('orientation')}>
              Orientation &amp; Programme officiel
            </button>
            <button type="button" className="btn" onClick={() => setActiveModal('settings')}>
              Paramètres &amp; Apparence
            </button>
            <button type="button" className="btn" onClick={() => setActiveModal('help')}>
              Aide &amp; Raccourcis
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
