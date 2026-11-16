import { describe, expect, it } from 'vitest';
import {
  isLinkedStudentInClass,
  professorCanAccessClass,
  professorCanAccessDataPath,
  resolveProfessorClassAccess,
} from '../../src/server/professor/access';

describe('professor class access policy', () => {
  it('keeps legacy absent and empty assignments compatible with access to all', () => {
    expect(resolveProfessorClassAccess({})).toMatchObject({ scope: 'all', legacy: true });
    expect(resolveProfessorClassAccess({ profClasses: [] })).toMatchObject({ scope: 'all', legacy: true });
  });

  it('treats a legacy non-empty list as an explicit selection', () => {
    const access = resolveProfessorClassAccess({ profClasses: ['2eme-bac-sc-math'] });
    expect(access).toEqual({ scope: 'selected', classIds: ['2eme-bac-sc-math'], legacy: true });
    expect(professorCanAccessClass(access, '2eme-bac-sc-math')).toBe(true);
    expect(professorCanAccessClass(access, 'tronc-commun-sc')).toBe(false);
  });

  it('distinguishes explicit all, selected and none even when arrays are empty', () => {
    expect(resolveProfessorClassAccess({ profClassScope: 'all', profClasses: ['ignored'] }))
      .toEqual({ scope: 'all', classIds: [], legacy: false });
    expect(resolveProfessorClassAccess({ profClassScope: 'selected', profClasses: ['1ere-bac-sc-ex'] }))
      .toEqual({ scope: 'selected', classIds: ['1ere-bac-sc-ex'], legacy: false });
    expect(resolveProfessorClassAccess({ profClassScope: 'none', profClasses: ['ignored'] }))
      .toEqual({ scope: 'none', classIds: [], legacy: false });
  });

  it('never grants a content path through an unrelated class', () => {
    const access = resolveProfessorClassAccess({
      profClassScope: 'selected',
      profClasses: ['1ere-bac-sc-ex'],
    });
    expect(professorCanAccessDataPath(access, 'data/1ere-bac-sc-ex/algebre/manifest.json')).toBe(true);
    expect(professorCanAccessDataPath(access, 'data/classes/1ere-bac-sc-ex.json')).toBe(true);
    expect(professorCanAccessDataPath(access, 'data/2eme-bac-sc-math/algebre/manifest.json')).toBe(false);
  });

  it('requires the canonical professor link and matching class for a student', () => {
    const student = { role: 'student', profId: 'prof-1', classId: 'tronc-commun-sc' };
    expect(isLinkedStudentInClass(student, 'prof-1', 'tronc-commun-sc')).toBe(true);
    expect(isLinkedStudentInClass(student, 'prof-2', 'tronc-commun-sc')).toBe(false);
    expect(isLinkedStudentInClass(student, 'prof-1', '2eme-bac-sc-math')).toBe(false);
    expect(isLinkedStudentInClass({ ...student, role: 'prof' }, 'prof-1', 'tronc-commun-sc')).toBe(false);
  });
});
