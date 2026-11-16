import { describe, expect, it } from 'vitest';
import {
  serializeSessionFocus,
  serializeSessionStateRead,
  serializeSessionStart,
  serializeSessionStateUpdate,
} from './professorClassroomPayloads';

describe('session classroom request bodies', () => {
  it.each(['paused', 'running', 'stopped'] as const)(
    'serializes the %s control without a classId',
    status => {
      const body = JSON.parse(serializeSessionStateUpdate({ status }));
      expect(body).toEqual({ status });
      expect(body).not.toHaveProperty('classId');
    },
  );

  it('keeps a classId only for an explicit class selection', () => {
    expect(JSON.parse(serializeSessionStateUpdate({
      classId: '1bac',
      chapterId: 'fonctions',
      chapterTitle: 'Fonctions numériques',
    }))).toEqual({
      classId: '1bac',
      chapterId: 'fonctions',
      chapterTitle: 'Fonctions numériques',
    });
  });

  it('serializes an explicit session start with its selected class', () => {
    expect(JSON.parse(serializeSessionStart('1bac'))).toEqual({
      status: 'running',
      classId: '1bac',
    });
  });

  it('reads the active session without a profile or workspace classId', () => {
    expect(JSON.parse(serializeSessionStateRead())).toEqual({});
  });

  it('publishes the piloted class alone, never a session status', () => {
    const body = JSON.parse(serializeSessionFocus('2bac'));
    expect(body).toEqual({ classId: '2bac' });
    expect(body).not.toHaveProperty('status');
  });
});
