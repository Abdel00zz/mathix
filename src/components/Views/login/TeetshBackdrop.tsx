import React from 'react';

/**
 * Fond Seyès écolier chic : lignes bleues estompées, marge rouge animée,
 * combinées au fond vectoriel Teetsh affiné.
 */
export const TeetshRibbons: React.FC = () => (
  <div className="ts-backdrop ts-seyes-backdrop" aria-hidden="true">
    <div className="ts-seyes-sheet" />
    <div className="ts-seyes-margin" />
    <svg
      className="ts-backdrop-svg"
      viewBox="0 0 1440 900"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="tsBackdropGlow" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </radialGradient>
      </defs>

      <rect width="1440" height="900" fill="url(#tsBackdropGlow)" />
    </svg>
  </div>
);

interface TeetshBrandBadgeProps {
  icon: string;
  alt: string;
  title: string;
}

/**
 * En-tête de marque inspiré du prototype « Apprendre — Connexion » :
 * carré signature [A] en bleu marine et typographie littéraire.
 */
export const TeetshBrandBadge: React.FC<TeetshBrandBadgeProps> = ({ icon, alt, title }) => (
  <div className="ts-brand-badge brand">
    <span className="ts-brand-mark mark" aria-hidden="true">A</span>
    <span className="ts-brand-wordmark">{title}</span>
    <img src={icon} alt={alt} className="ts-brand-logo sr-only" />
  </div>
);

