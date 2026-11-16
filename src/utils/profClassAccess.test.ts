import { describe, expect, it } from 'vitest';
import {
  classIdFromDataPath,
  filterProfessorClasses,
  resolveClientProfessorClassScope,
} from './profClassAccess';

const classes = [{ id: 'a' }, { id: 'b' }];

describe('client professor class access', () => {
  it('preserves legacy empty-as-all behavior', () => {
    expect(resolveClientProfessorClassScope(undefined, [])).toBe('all');
    expect(filterProfessorClasses(classes, undefined, [])).toEqual(classes);
  });

  it('distinguishes an explicit none from legacy empty', () => {
    expect(filterProfessorClasses(classes, 'none', [])).toEqual([]);
  });

  it('keeps only the explicit selection', () => {
    expect(filterProfessorClasses(classes, 'selected', ['b'])).toEqual([{ id: 'b' }]);
  });

  it('recognizes both class manifests and nested class resources', () => {
    expect(classIdFromDataPath('data/classes/class-a.json')).toBe('class-a');
    expect(classIdFromDataPath('data/class-a/chapter-1/quiz.json')).toBe('class-a');
    expect(classIdFromDataPath('data/manifest.json')).toBeNull();
  });
});
