import React from 'react';
import {
  faAnglesRight,
  faBinoculars,
  faBookBookmark,
  faBookOpen,
  faCertificate,
  faCircleCheck,
  faClipboardList,
  faCodeBranch,
  faCompass,
  faCompassDrafting,
  faFlask,
  faKey,
  faLightbulb,
  faLink,
  faListCheck,
  faNoteSticky,
  faPuzzlePiece,
  faRotateLeft,
  faRoute,
  faScroll,
  faSquareRootVariable,
  faTriangleExclamation,
  faWandMagicSparkles,
  faWrench,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';

/**
 * Pictogrammes des blocs de révision : un glyphe Font Awesome distinct par type
 * (SVG tree-shaken uniforme, aucune icône maison à maintenir).
 */
export const REVISION_ICONS: Record<string, IconDefinition> = {
  definition: faBookBookmark,
  theorem: faCertificate,
  proposition: faSquareRootVariable,
  property: faScroll,
  lemma: faLink,
  corollary: faCodeBranch,
  consequence: faAnglesRight,
  method: faRoute,
  strategy: faCompass,
  technique: faWrench,
  rappel: faRotateLeft,
  application: faCompassDrafting,
  example: faFlask,
  solution: faCircleCheck,
  hint: faKey,
  problem: faPuzzlePiece,
  proof: faListCheck,
  remark: faNoteSticky,
  note: faNoteSticky,
  intuition: faLightbulb,
  summary: faClipboardList,
  warning: faTriangleExclamation,
  exploration: faBinoculars,
  cela_permet_de: faWandMagicSparkles,
  intro: faBookOpen,
};

const DEFAULT_ICON: IconDefinition = faBookOpen;

export const iconForBlockType = (type: string): IconDefinition => REVISION_ICONS[type] ?? DEFAULT_ICON;

/** Icône décorative d'un badge : masquée aux lecteurs d'écran (le libellé suffit). */
export function RevisionBadgeIcon({ type }: { type: string }) {
  const icon = iconForBlockType(type);
  return <FaIcon icon={icon} className="revision-badge-icon" size={15} aria-hidden="true" />;
}
