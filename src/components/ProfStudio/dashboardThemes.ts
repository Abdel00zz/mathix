/**
 * Thèmes de couleurs du dashboard (version tablette / session professeur).
 *
 * Chaque palette décline l'accent principal du tableau de bord (cartes, boutons,
 * texte) de façon cohérente : teinte forte, teinte profonde, fond lavé, bordure
 * et accent secondaire. Le thème est choisi côté PC (onglet « Couleurs » des
 * paramètres de session) puis synchronisé avec le compte : la tablette du même
 * professeur l'applique au dashboard via `themeVars`.
 */

export type DashboardThemeId =
  | 'default'
  | 'sky'
  | 'pistachio'
  | 'vercel'
  | 'cream'
  | 'ocean'
  | 'iris'
  | 'amber'
  | 'coral';

export interface DashboardTheme {
  id: DashboardThemeId;
  label: string;
  /** Pastille d'aperçu dans le sélecteur (couleur dominante). */
  swatch: string;
  /** Variables CSS exposées sur `.dashboard-shell`. */
  primary: string;
  deep: string;
  soft: string;
  border: string;
  wash: string;
  frame: string;
  lilac: string;
  lilacSoft: string;
}

export const DASHBOARD_THEMES: DashboardTheme[] = [
  {
    id: 'default',
    label: 'Mauve (par défaut)',
    swatch: '#b5369b',
    primary: '#b5369b',
    deep: '#8f1f7d',
    soft: 'rgba(181, 54, 155, 0.1)',
    border: 'rgba(181, 54, 155, 0.2)',
    wash: '#fcf7fb',
    frame: '#681758',
    lilac: 'rgb(149, 112, 252)',
    lilacSoft: 'rgba(149, 112, 252, 0.1)',
  },
  {
    id: 'sky',
    label: 'Bleu ciel',
    swatch: '#0284c7',
    primary: '#0284c7',
    deep: '#075985',
    soft: 'rgba(2, 132, 199, 0.1)',
    border: 'rgba(2, 132, 199, 0.22)',
    wash: '#f0f9ff',
    frame: '#075985',
    lilac: 'rgb(56, 189, 248)',
    lilacSoft: 'rgba(56, 189, 248, 0.12)',
  },
  {
    id: 'pistachio',
    label: 'Pistache',
    swatch: '#65a30d',
    primary: '#65a30d',
    deep: '#3f6212',
    soft: 'rgba(101, 163, 13, 0.12)',
    border: 'rgba(101, 163, 13, 0.24)',
    wash: '#f7fee7',
    frame: '#365314',
    lilac: 'rgb(163, 230, 53)',
    lilacSoft: 'rgba(163, 230, 53, 0.14)',
  },
  {
    id: 'vercel',
    label: 'Vercel',
    swatch: '#0070f3',
    primary: '#0070f3',
    deep: '#0051c9',
    soft: 'rgba(0, 112, 243, 0.08)',
    border: 'rgba(0, 112, 243, 0.22)',
    wash: '#fafafa',
    frame: '#111111',
    lilac: 'rgb(0, 112, 243)',
    lilacSoft: 'rgba(0, 112, 243, 0.1)',
  },
  {
    id: 'cream',
    label: 'Crème',
    swatch: '#b45309',
    primary: '#b45309',
    deep: '#92400e',
    soft: 'rgba(180, 83, 9, 0.1)',
    border: 'rgba(180, 83, 9, 0.22)',
    wash: '#fffbeb',
    frame: '#78350f',
    lilac: 'rgb(245, 158, 11)',
    lilacSoft: 'rgba(245, 158, 11, 0.12)',
  },
  {
    id: 'ocean',
    label: 'Océan',
    swatch: '#0d9488',
    primary: '#0d9488',
    deep: '#115e59',
    soft: 'rgba(13, 148, 136, 0.1)',
    border: 'rgba(13, 148, 136, 0.22)',
    wash: '#f0fdfa',
    frame: '#134e4a',
    lilac: 'rgb(45, 212, 191)',
    lilacSoft: 'rgba(45, 212, 191, 0.12)',
  },
  {
    id: 'iris',
    label: 'Iris',
    swatch: '#7c3aed',
    primary: '#7c3aed',
    deep: '#6d28d9',
    soft: 'rgba(124, 58, 237, 0.1)',
    border: 'rgba(124, 58, 237, 0.22)',
    wash: '#f5f3ff',
    frame: '#4c1d95',
    lilac: 'rgb(167, 139, 250)',
    lilacSoft: 'rgba(167, 139, 250, 0.12)',
  },
  {
    id: 'amber',
    label: 'Ambre',
    swatch: '#d97706',
    primary: '#d97706',
    deep: '#b45309',
    soft: 'rgba(217, 119, 6, 0.1)',
    border: 'rgba(217, 119, 6, 0.22)',
    wash: '#fffbeb',
    frame: '#92400e',
    lilac: 'rgb(251, 191, 36)',
    lilacSoft: 'rgba(251, 191, 36, 0.12)',
  },
  {
    id: 'coral',
    label: 'Corail',
    swatch: '#f43f5e',
    primary: '#f43f5e',
    deep: '#be123c',
    soft: 'rgba(244, 63, 94, 0.1)',
    border: 'rgba(244, 63, 94, 0.22)',
    wash: '#fff1f2',
    frame: '#881337',
    lilac: 'rgb(251, 113, 133)',
    lilacSoft: 'rgba(251, 113, 133, 0.12)',
  },
];

export function getDashboardTheme(id: DashboardThemeId | string | undefined): DashboardTheme {
  return DASHBOARD_THEMES.find(t => t.id === id) || DASHBOARD_THEMES[0];
}

/** Variables CSS à poser sur `.dashboard-shell` (ou tout conteneur du thème). */
export function themeVars(theme: DashboardTheme): React.CSSProperties {
  return {
    '--dashboard-mauve': theme.primary,
    '--dashboard-mauve-deep': theme.deep,
    '--dashboard-mauve-soft': theme.soft,
    '--dashboard-mauve-border': theme.border,
    '--dashboard-mauve-wash': theme.wash,
    '--dashboard-mauve-frame': theme.frame,
    '--dashboard-lilac': theme.lilac,
    '--dashboard-lilac-soft': theme.lilacSoft,
  } as React.CSSProperties;
}
