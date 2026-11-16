import { CalendarClock, PanelsTopLeft, UserRoundCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Les trois destinations d'une classe, portées par la coque. */
export type ProfSection = 'seance' | 'eleves' | 'studio';

export interface ProfSectionMeta {
  id: ProfSection;
  label: string;
  /** Ce que le professeur vient y faire — lu sur la tuile d'accueil. */
  hint: string;
  icon: LucideIcon;
  /** Tuile d'icône : un accent par destination, pour se repérer de loin. */
  tile: string;
  /** Bordure et fond au survol de la tuile d'accueil. */
  accent: string;
}

/**
 * Ordre unique, réutilisé par l'accueil de classe, le fil de retour et les
 * raccourcis Ctrl+1…3. Une seule source évite que la carte et le raccourci ne
 * désignent plus la même section.
 */
export const PROF_SECTIONS: ProfSectionMeta[] = [
  {
    id: 'seance',
    label: 'Gérer les séances',
    hint: 'Historique, planification, impression',
    icon: CalendarClock,
    tile: 'bg-[#1677ff] text-white shadow-sm',
    accent: 'hover:border-[#91caff] hover:bg-[#e6f4ff]/25 hover:shadow-md',
  },
  {
    id: 'eleves',
    label: 'Élèves & Appel',
    hint: 'Appel, rotation, messages directs',
    icon: UserRoundCheck,
    tile: 'bg-[#52c41a] text-white shadow-sm',
    accent: 'hover:border-[#b7eb8f] hover:bg-[#f6ffed]/35 hover:shadow-md',
  },
  {
    id: 'studio',
    label: 'Studio édition',
    hint: 'Chapitres, exercices, quiz',
    icon: PanelsTopLeft,
    tile: 'bg-[#fa8c16] text-white shadow-sm',
    accent: 'hover:border-[#ffd591] hover:bg-[#fff7e6]/35 hover:shadow-md',
  },
];

export function profSectionMeta(id: ProfSection): ProfSectionMeta {
  return PROF_SECTIONS.find(entry => entry.id === id) ?? PROF_SECTIONS[0];
}
