import React from 'react';
import {
  faUserGraduate,
  faChalkboardUser,
  faPenNib,
  faDesktop,
  faPaperPlane,
  faGraduationCap,
  faCompassDrafting,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Emblème Élève (Font Awesome) dans le médaillon cobalt.
 */
export const StudentSparkEmblem: React.FC<IconProps> = ({ size = 22, className = '' }) => (
  <FaIcon
    icon={faUserGraduate}
    size={size}
    className={`ts-art-layer-front text-[#5066dc] ${className}`.trim()}
    aria-hidden="true"
  />
);

/**
 * Emblème Professeur (Font Awesome) dans le médaillon indigo.
 */
export const TeacherAtelierEmblem: React.FC<IconProps> = ({ size = 22, className = '' }) => (
  <FaIcon
    icon={faChalkboardUser}
    size={size}
    className={`ts-art-layer-front text-[#00085a] ${className}`.trim()}
    aria-hidden="true"
  />
);

export const StudioCreateIcon: React.FC<IconProps> = ({ size = 17, className }) => (
  <FaIcon icon={faPenNib} size={size} className={className} aria-hidden="true" />
);

export const StudioPreviewIcon: React.FC<IconProps> = ({ size = 17, className }) => (
  <FaIcon icon={faDesktop} size={size} className={className} aria-hidden="true" />
);

export const StudioPublishIcon: React.FC<IconProps> = ({ size = 17, className }) => (
  <FaIcon icon={faPaperPlane} size={size} className={className} aria-hidden="true" />
);

export const LevelCapIcon: React.FC<IconProps> = ({ size = 17, className }) => (
  <FaIcon icon={faGraduationCap} size={size} className={className} aria-hidden="true" />
);

export const LevelRootIcon: React.FC<IconProps> = ({ size = 17, className }) => (
  <FaIcon icon={faCompassDrafting} size={size} className={className} aria-hidden="true" />
);

/**
 * Trait calligraphique ondulé dégradé (signature Quizlet raffinée).
 */
export const QuizletAccentWave: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 120 10" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="tsQzWave" x1="2" y1="5" x2="118" y2="5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5066dc" />
        <stop offset="0.6" stopColor="#7c5dfa" />
        <stop offset="1" stopColor="#fb923c" />
      </linearGradient>
    </defs>
    <path
      d="M2 6.5Q12 1.8 22 6.5T42 6.5T62 6.5T82 6.5T102 6.5T118 5.2"
      stroke="url(#tsQzWave)"
      strokeWidth="2.8"
      strokeLinecap="round"
    />
  </svg>
);
