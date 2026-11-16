import React from 'react';
import MathRenderer from '../../MathRenderer';
import type { Stroke } from './types';

interface CanvasTextLayerProps {
  strokes: Stroke[];
  revision: number;
  selectedIndexes: Set<number>;
  editingIndex?: number;
  isEditMode: boolean;
  fallbackColor: string;
  onEditText: (index: number) => void;
}

/** Convertit `\fillblank{x}` en soulignement TeX, visible seulement en mode auteur. */
function expandFillBlanks(value: string, reveal: boolean): string {
  return value.replace(/\\fillblank\{([^{}]*)\}/g, (_, inner: string) =>
    reveal ? `\\underline{${inner}}` : `\\underline{\\phantom{${inner}}}`,
  );
}

/**
 * Couche DOM strictement bornée au canvas courant.
 * Elle compile le LaTeX (KaTeX) sans alourdir le moteur de tracé 2D.
 */
const CanvasTextLayer: React.FC<CanvasTextLayerProps> = ({
  strokes,
  revision,
  selectedIndexes,
  editingIndex,
  isEditMode,
  fallbackColor,
  onEditText,
}) => (
  <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none" aria-live="polite">
    {strokes.map((stroke, index) => {
      if (!stroke.isText || !stroke.text || editingIndex === index) return null;
      const anchor = stroke.points[0];
      if (!anchor) return null;
      const selected = selectedIndexes.has(index);
      return (
        <div
          key={`canvas-text-${index}`}
          data-canvas-text-index={index}
          data-render-revision={revision}
          className={`canvas-compiled-text absolute whitespace-pre-wrap rounded-md px-1.5 py-0.5 leading-relaxed ${isEditMode ? 'pointer-events-auto cursor-text' : ''} ${selected && isEditMode ? 'ring-2 ring-blue-400/70 bg-blue-50/35' : ''}`}
          style={{
            left: anchor.x,
            top: anchor.y,
            maxWidth: `calc(100% - ${Math.max(8, anchor.x)}px)`,
            color: stroke.color || fallbackColor,
            fontFamily: 'Caveat, cursive',
            fontSize: `${stroke.fontSize || 24}px`,
          }}
          title={isEditMode ? 'Double-cliquez pour modifier ce texte' : undefined}
          onDoubleClick={(event) => {
            if (!isEditMode) return;
            event.preventDefault();
            event.stopPropagation();
            onEditText(index);
          }}
          onClick={(event) => {
            if (isEditMode && event.detail >= 2) onEditText(index);
          }}
        >
          <MathRenderer
            inline
            content={expandFillBlanks(stroke.text, isEditMode)}
            enableKeywords={false}
            enableLexicon={false}
            fontSize="inherit"
          />
        </div>
      );
    })}
  </div>
);

export default React.memo(CanvasTextLayer);
