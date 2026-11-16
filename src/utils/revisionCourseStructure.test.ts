import { describe, expect, it } from 'vitest';
import {
  computeGlobalNumbering,
  filterSectionsByVisibility,
  getSeancePlan,
  isBlockVisible,
} from './revisionCourseStructure';
import type { RevisionBlock, RevisionBlockVisibilitySettings, RevisionSection } from '../types';

const FULL_VISIBILITY: RevisionBlockVisibilitySettings = {
  method: true,
  example: true,
  exploration: true,
  proof: true,
  remark: true,
  note: true,
  intuition: true,
  summary: true,
};

describe('revisionCourseStructure', () => {
  it('numbers hints and methods even when occurring only once, and pluralizes definitions only', () => {
    const sections: RevisionSection[] = [
      {
        id: 'sec-1',
        title: 'Suites',
        blocks: [
          { type: 'definition', content: 'Def 1' },
          { type: 'method', content: 'Methode unique' },
          { type: 'hint', content: 'Indice unique' },
          { type: 'theorem', content: 'Th 1' },
          { type: 'theorem', content: 'Th 2' },
        ],
      },
    ];

    const numbering = computeGlobalNumbering(sections);
    expect(numbering['sec-1-0']).toBeUndefined();
    expect(numbering['sec-1-1']).toBe(1);
    expect(numbering['sec-1-2']).toBe(1);
    expect(numbering['sec-1-3']).toBe(1);
    expect(numbering['sec-1-4']).toBe(2);
  });

  it('filters note blocks separately from canonical remark aliases', () => {
    expect(isBlockVisible({ type: 'note', content: 'A' }, { ...FULL_VISIBILITY, note: false })).toBe(false);
    expect(isBlockVisible({ type: 'remark', content: 'B' }, { ...FULL_VISIBILITY, note: false })).toBe(true);
    expect(isBlockVisible({ type: 'remarque' as RevisionBlock['type'], content: 'C' }, { ...FULL_VISIBILITY, remark: false })).toBe(false);

    const sections: RevisionSection[] = [
      { id: 's-method', title: 'M', category: 'method', blocks: [{ type: 'method', content: 'x' }] },
      { id: 's-course', title: 'C', blocks: [{ type: 'remark', content: 'visible' }, { type: 'proof', content: 'hidden' }] },
    ];
    const filtered = filterSectionsByVisibility(sections, { ...FULL_VISIBILITY, method: false, proof: false });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('s-course');
    expect(filtered[0].blocks).toHaveLength(1);
  });

  it('validates sequential seance plans accurately', () => {
    const complete: RevisionSection[] = [
      { id: 's1', title: 'Un', seance: 1 },
      { id: 's2', title: 'Deux', seance: 2 },
      { id: 's3', title: 'Trois', seance: 2 },
    ];
    expect(getSeancePlan(complete)).toEqual({ totalSeances: 2, isComplete: true });

    const gapped: RevisionSection[] = [
      { id: 's1', title: 'Un', seance: 1 },
      { id: 's2', title: 'Trois', seance: 3 },
    ];
    expect(getSeancePlan(gapped)).toEqual({ totalSeances: 3, isComplete: false });
  });
});
