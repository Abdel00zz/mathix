import type { ReactNode } from 'react';
import { inputClass } from './settingsUi';

/**
 * Primitives des paramètres du professeur.
 *
 * Un réglage se lit toujours de la même façon : une **carte** par sujet (titre
 * + phrase d'explication), puis des **lignes** — le libellé et son aide à
 * gauche, le contrôle à droite. Les booléens sont des **interrupteurs**
 * (`role="switch"`), jamais des cases à cocher nues : au doigt, on voit l'état
 * d'un coup d'œil, et l'action est explicite.
 */

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Carte de réglages : un sujet, une explication, des lignes séparées. */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] sm:p-5">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      )}
      <div className="mt-3 divide-y divide-slate-100">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
  disabled?: boolean;
}

/** Ligne de réglage : libellé (et aide) à gauche, contrôle à droite. */
export function SettingsRow({ label, hint, children, disabled = false }: SettingsRowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0 ${disabled ? 'opacity-55' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nom accessible du réglage (le libellé est affiché à côté). */
  label: string;
  disabled?: boolean;
}

/**
 * Interrupteur : actionnable au doigt, au clic, à la barre d'espace et au clavier
 * (c'est un bouton), avec un anneau de focus visible et un état lu par les
 * lecteurs d'écran (`role="switch"` + `aria-checked`).
 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
        checked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-slate-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.3)] transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Ligne prête à l'emploi : libellé, aide et interrupteur alignés. */
export function SwitchRow({ label, hint, checked, onChange, disabled = false }: SwitchRowProps) {
  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </SettingsRow>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
}

interface SelectRowProps<T extends string> {
  label: string;
  hint?: string;
  value: T;
  options: Array<Choice<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Ligne de réglage à choix unique (menu déroulant). */
export function SelectRow<T extends string>({ label, hint, value, options, onChange, disabled = false }: SelectRowProps<T>) {
  return (
    <div className={`py-3.5 first:pt-0 last:pb-0 ${disabled ? 'opacity-55' : ''}`}>
      <label className="block">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
        <select
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value as T)}
          className={`${inputClass} mt-2.5`}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Rendu de la valeur courante (ex. « 105 % »). */
  format?: (value: number) => string;
}

/** Ligne de réglage numérique continue. */
export function SliderRow({ label, hint, value, min, max, step, onChange, format }: SliderRowProps) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <label className="block">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-slate-800">{label}</span>
          <span className="font-mono text-xs text-slate-500">{format ? format(value) : value}</span>
        </span>
        {hint && <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          className="mt-3 w-full accent-indigo-600"
        />
      </label>
    </div>
  );
}
