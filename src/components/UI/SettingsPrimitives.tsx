import React from 'react';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from './FaIcon';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Primitives de la page Réglages.
 *
 * L'écran précédent empilait des `h3`, des `mb-8` et des grilles ad hoc :
 * chaque onglet inventait sa propre mise en page, d'où l'impression de
 * brouillon. Tout passe désormais par quatre briques, et une seule règle :
 *
 *   Section  → un titre, une intention, un filet de séparation
 *   Field    → un libellé au-dessus, un contrôle pleine largeur, une aide
 *   Row      → un libellé à gauche, un contrôle à droite (bascules)
 *   Choice   → un choix parmi n, en cartes lisibles au pouce
 *
 * Palette partagée avec le dashboard : surface claire, encre sombre, filets
 * mauves discrets et accent principal mauve/lilas.
 */

/** Champ de saisie : hauteur confortable au pouce, 16px sous `sm` (anti-zoom iOS). */
export const inputClass =
  'w-full rounded-xl border border-slate-200/80 bg-slate-50/40 px-3.5 py-2.5 typo-ui text-[16px] sm:text-[14px] ' +
  'text-[var(--modal-ink)] outline-none transition-all placeholder:text-[#948a95] ' +
  'focus:border-[var(--modal-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--modal-accent)]/10';

/**
 * Une zone de réglages = une carte autonome, avec son propre bouton
 * d'enregistrement.
 */
export const Section: React.FC<{
  title: string;
  description?: string;
  /** Conservé pour compatibilité d'appel ; les cartes s'espacent d'elles-mêmes. */
  first?: boolean;
  /** Affiche le bouton d'enregistrement de la carte. */
  onSave?: () => void;
  /** Bascule le bouton en état « enregistré » (retour visuel après clic). */
  saved?: boolean;
  saveLabel?: string;
  children: React.ReactNode;
}> = ({ title, description, onSave, saved, saveLabel, children }) => {
  const { lang } = useI18n();
  const resolvedSaveLabel = saveLabel || (lang === 'ar' ? 'حفظ' : 'Sauvegarder');
  const savedLabel = lang === 'ar' ? 'تم الحفظ' : 'Enregistré';
  return <section className="modal-card mb-3.5 p-4 sm:mb-5 sm:p-5 transition-all">
    <div>
      <h2 className="typo-ui modal-t-h2 font-bold tracking-tight text-[var(--modal-ink)]">{title}</h2>
      {description && (
        <p className="typo-ui mt-0.5 modal-t-hint leading-relaxed text-[var(--modal-muted)]">{description}</p>
      )}
    </div>
    <div className="mt-4 space-y-4 sm:mt-5">{children}</div>
    {onSave && (
      /* L'espace blanc distingue l'action du contenu sans ajouter de filet. */
      <div className="mt-5 flex justify-end pt-1">
        <button
          type="button"
          onClick={onSave}
          className={`app-tap modal-button-primary inline-flex items-center justify-center gap-2 px-5 py-2 typo-ui modal-t-body font-bold text-white transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modal-accent)] ${
            saved ? 'bg-none bg-[var(--modal-success)]' : ''
          }`}
        >
          {saved ? <><FaIcon icon={faCheck} size={14} aria-hidden="true" /> {savedLabel}</> : resolvedSaveLabel}
        </button>
      </div>
    )}
  </section>;
};

export const Field: React.FC<{
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}> = ({ label, hint, htmlFor, children }) => (
  <div>
    <label htmlFor={htmlFor} className="typo-ui mb-1.5 block modal-t-label font-semibold text-[var(--modal-ink)]">
      {label}
    </label>
    {children}
    {hint && <p className="typo-ui mt-1.5 modal-t-hint leading-relaxed text-[var(--modal-muted)]">{hint}</p>}
  </div>
);

/** Deux champs côte à côte dès la tablette, empilés sur téléphone. */
export const FieldPair: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">{children}</div>
);

export const Row: React.FC<{
  label: string;
  hint?: string;
  control: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ label, hint, control, icon }) => (
  <div className="flex items-start justify-between gap-3 sm:gap-4">
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      {icon && <span className="mt-0.5 shrink-0 text-[var(--modal-accent)]">{icon}</span>}
      <div className="min-w-0">
        <p className="typo-ui modal-t-body font-semibold text-[var(--modal-ink)]">{label}</p>
        {hint && <p className="typo-ui mt-0.5 modal-t-hint leading-relaxed text-[var(--modal-muted)]">{hint}</p>}
      </div>
    </div>
    <div className="shrink-0 pt-0.5">{control}</div>
  </div>
);

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  /** Aperçu typographique appliqué au libellé (onglet Apparence). */
  labelClassName?: string;
  /** Pastille facultative pour les choix de papier/couleur. */
  swatchClassName?: string;
}

/** Choix unique en cartes — lisible d'un coup d'œil, et cliquable au pouce. */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  columns = 3,
  ariaLabel,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid grid-cols-1 gap-2.5 ${columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
    >
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`app-tap rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modal-accent)] ${
              active
                ? 'border-[var(--modal-accent)] bg-gradient-to-br from-[var(--modal-accent-soft)] to-white text-[var(--modal-accent-deep)] shadow-sm ring-1 ring-[var(--modal-accent)]/30'
                : 'border-slate-200/80 bg-white text-[var(--modal-ink)] hover:border-[var(--modal-accent-border)] hover:bg-[var(--modal-canvas)]'
            }`}
          >
            <span className="flex items-center gap-2">
              {option.swatchClassName && (
                <span aria-hidden="true" className={`h-5 w-5 shrink-0 rounded-full border shadow-inner ${option.swatchClassName}`} />
              )}
              <span className={`typo-ui modal-t-body block font-semibold ${option.labelClassName || ''}`}>{option.label}</span>
            </span>
            {option.hint && (
              <span className={`typo-ui mt-0.5 block modal-t-hint ${active ? 'text-[var(--modal-accent-deep)]/80' : 'text-[var(--modal-muted)]'}`}>
                {option.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Petit choix compact aligné en ligne (durées, délais). */
export function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`app-tap rounded-xl border px-3.5 py-2 typo-ui modal-t-label font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modal-accent)] ${
              active
                ? 'border-[var(--modal-accent)] bg-[var(--modal-accent)] text-white shadow-sm'
                : 'border-slate-200/80 bg-white text-[var(--modal-ink)] hover:border-[var(--modal-accent-border)] hover:bg-[var(--modal-accent-soft)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
