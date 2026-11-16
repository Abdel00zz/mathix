import React, { useMemo } from 'react';
import type { Point, ShapeType, Stroke } from './types';
import { strokeToFreehandSvgPath } from './renderUtils';

/**
 * Rendu VECTORIEL des traits manuscrits (SVG) — le même moteur de lissage
 * (`perfect-freehand`) que le canvas de la tablette, réutilisé pour
 * l'impression. Aucune rasterisation : les traits restent nets au PDF.
 */

const HIGHLIGHTER_ALPHA = 0.45;

interface StrokeSvgProps {
  strokes: Stroke[];
  /** Largeur d'affichage CSS (la hauteur s'adapte au contenu). */
  width?: number;
  className?: string;
  /** Fond transparent (pour poser l'encre sur le quadrillage de la zone imprimée). */
  transparent?: boolean;
}

/** Courbe lissée par milieux de segments (hors perfect-freehand : surligneur, pointillés…). */
function smoothPathD(points: Point[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  if (points.length > 1) {
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  }
  return d;
}

function dashArray(stroke: Stroke): string | undefined {
  if (stroke.lineStyle === 'dashed') return `${stroke.width * 2.5} ${stroke.width * 1.8}`;
  if (stroke.lineStyle === 'dotted') return `0 ${Math.max(4, stroke.width * 2.2)}`;
  return undefined;
}

/** Pointe de flèche en polygone SVG (même géométrie que drawArrowhead). */
function arrowHeadPoints(fromX: number, fromY: number, toX: number, toY: number, width: number): string {
  const headlen = Math.max(10, width * 3.5);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const a = angle - Math.PI / 6;
  const b = angle + Math.PI / 6;
  const x1 = toX - headlen * Math.cos(a);
  const y1 = toY - headlen * Math.sin(a);
  const x2 = toX - headlen * Math.cos(b);
  const y2 = toY - headlen * Math.sin(b);
  return `${toX},${toY} ${x1},${y1} ${x2},${y2}`;
}

function regularPolygonPoints(cx: number, cy: number, rx: number, ry: number, sides: number, startAngle: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / sides;
    pts.push(`${cx + rx * Math.cos(angle)},${cy + ry * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

/** Éléments SVG d'une forme géométrique. */
function shapeElements(stroke: Stroke, key: number): React.ReactNode {
  const p1 = stroke.points[0];
  const p2 = stroke.points[stroke.points.length - 1];
  if (!p1 || !p2) return null;
  const color = stroke.color;
  const sw = stroke.width;
  const common = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const dash = dashArray(stroke);
  const style = dash ? { ...common, strokeDasharray: dash } : common;
  const type = stroke.shapeType as ShapeType;

  switch (type) {
    case 'line':
      return <path key={key} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`} {...style} />;
    case 'arrow':
      return (
        <g key={key}>
          <path d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`} {...style} />
          <polygon points={arrowHeadPoints(p1.x, p1.y, p2.x, p2.y, sw)} fill={color} />
        </g>
      );
    case 'double-arrow':
      return (
        <g key={key}>
          <path d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`} {...style} />
          <polygon points={arrowHeadPoints(p1.x, p1.y, p2.x, p2.y, sw)} fill={color} />
          <polygon points={arrowHeadPoints(p2.x, p2.y, p1.x, p1.y, sw)} fill={color} />
        </g>
      );
    case 'axes': {
      const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      return (
        <g key={key}>
          <path d={`M ${minX} ${cy} L ${maxX} ${cy} M ${cx} ${maxY} L ${cx} ${minY}`} {...style} />
          <polygon points={arrowHeadPoints(minX, cy, maxX, cy, sw)} fill={color} />
          <polygon points={arrowHeadPoints(cx, maxY, cx, minY, sw)} fill={color} />
        </g>
      );
    }
    case 'rectangle': {
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      return <rect key={key} x={x} y={y} width={Math.abs(p2.x - p1.x)} height={Math.abs(p2.y - p1.y)} {...style} />;
    }
    case 'circle': {
      const rx = (p2.x - p1.x) / 2, ry = (p2.y - p1.y) / 2;
      return <ellipse key={key} cx={p1.x + rx} cy={p1.y + ry} rx={Math.max(1, Math.abs(rx))} ry={Math.max(1, Math.abs(ry))} {...style} />;
    }
    case 'triangle':
      return <polygon key={key} points={`${(p1.x + p2.x) / 2},${p1.y} ${p2.x},${p2.y} ${p1.x},${p2.y}`} {...style} />;
    case 'right-triangle':
      return <polygon key={key} points={`${p1.x},${p1.y} ${p1.x},${p2.y} ${p2.x},${p2.y}`} {...style} />;
    case 'diamond': {
      const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
      return <polygon key={key} points={`${midX},${p1.y} ${p2.x},${midY} ${midX},${p2.y} ${p1.x},${midY}`} {...style} />;
    }
    case 'parallelogram': {
      const w = p2.x - p1.x, skew = w * 0.25;
      return <polygon key={key} points={`${p1.x + skew},${p1.y} ${p2.x},${p1.y} ${p2.x - skew},${p2.y} ${p1.x},${p2.y}`} {...style} />;
    }
    case 'pentagon':
    case 'hexagon': {
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2;
      const sides = type === 'pentagon' ? 5 : 6;
      const start = type === 'pentagon' ? -Math.PI / 2 : 0;
      return <polygon key={key} points={regularPolygonPoints(cx, cy, rx, ry, sides, start)} {...style} />;
    }
    case 'freeform':
    default:
      return <path key={key} d={smoothPathD(stroke.points)} {...style} />;
  }
}

/** Éléments SVG d'un trait libre (stylo / surligneur / pointillés / point). */
function freehandElements(stroke: Stroke, key: number): React.ReactNode {
  // Point isolé → disque net.
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    const r = Math.max(1, stroke.width / 2);
    return <circle key={key} cx={p.x} cy={p.y} r={r} fill={stroke.color} opacity={stroke.isHighlighter ? HIGHLIGHTER_ALPHA : stroke.opacity} />;
  }

  const isPerfect = !stroke.isHighlighter && !stroke.isEraser && stroke.lineStyle !== 'dashed' && stroke.lineStyle !== 'dotted';
  if (isPerfect) {
    return <path key={key} d={strokeToFreehandSvgPath(stroke)} fill={stroke.color} opacity={stroke.opacity} />;
  }

  // Surligneur / pointillés / tirets : trait lissé par milieux, épaisseur constante.
  const dash = dashArray(stroke);
  return (
    <path
      key={key}
      d={smoothPathD(stroke.points)}
      fill="none"
      stroke={stroke.color}
      strokeWidth={Math.max(1, stroke.width)}
      strokeLinecap={stroke.isHighlighter && stroke.highlighterType === 'chisel' ? 'butt' : 'round'}
      strokeLinejoin={stroke.isHighlighter && stroke.highlighterType === 'chisel' ? 'bevel' : 'round'}
      opacity={stroke.isHighlighter ? HIGHLIGHTER_ALPHA : stroke.opacity}
      strokeDasharray={dash}
    />
  );
}

/** Boîte englobante des traits, pour cadrer le SVG sans dépendre de la largeur d'origine. */
function strokesBBox(strokes: Stroke[]): { minX: number; minY: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 0, height: 0 };
  const pad = 16;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export default function StrokeSvg({ strokes, width = 720, className, transparent = false }: StrokeSvgProps) {
  const view = useMemo(() => strokesBBox(strokes), [strokes]);

  const elements = useMemo(() => {
    const out: React.ReactNode[] = [];
    strokes.forEach((stroke, index) => {
      if (stroke.isEraser) return; // la gomme n'est pas du contenu
      if (stroke.isText && stroke.text) {
        out.push(
          <text key={index} x={stroke.points[0]?.x ?? 0} y={stroke.points[0]?.y ?? 0} fontSize={stroke.fontSize || 24} fontFamily={stroke.font || 'Caveat'} fill={stroke.color}>
            {stroke.text}
          </text>,
        );
        return;
      }
      if (stroke.isImage) return; // images non vectorisées ici
      if (stroke.shapeType) {
        out.push(shapeElements(stroke, index));
        return;
      }
      out.push(freehandElements(stroke, index));
    });
    return out;
  }, [strokes]);

  if (strokes.length === 0 || view.width === 0) return null;

  return (
    <svg
      viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
      width={width}
      className={className}
      role="img"
      aria-label="Zone manuscrite"
      style={{ display: 'block', maxWidth: '100%', height: 'auto', background: transparent ? 'transparent' : '#ffffff' }}
    >
      {elements}
    </svg>
  );
}
