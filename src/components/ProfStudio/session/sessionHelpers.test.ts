import { describe, expect, it } from 'vitest';
import type { ArchivedSessionSummary, ClassStudentProgress, SessionState } from '../../../services/professorClassroomService';
import {
  countPresentStudents,
  resolvePilotedClassId,
  sessionActivitySummary,
  shouldStartNewSession,
  sortStudentsByName,
  formatDuration,
  sortSessionArchives,
} from './sessionHelpers';

const student = (accountId: string, revisionAvg: number): ClassStudentProgress => ({
  accountId,
  name: accountId,
  phone: '',
  progress: {
    chaptersStarted: 0,
    quizDone: 0,
    revisionAvg,
    exercisesDone: 0,
    quizScoreAvg: 0,
    lastActive: 0,
    chapters: [],
  },
});

describe('session student helpers', () => {
  const students = [student('absent', 90), student('present-low', 20), student('present-high', 70)];
  const presentIds = new Set(['present-low', 'present-high', 'unknown-id']);

  it('counts only enrolled students marked present', () => {
    expect(countPresentStudents(students, presentIds)).toBe(2);
  });

  it('orders the roll call alphabetically, independently of attendance', () => {
    expect(sortStudentsByName(students).map(item => item.accountId))
      .toEqual(['absent', 'present-high', 'present-low']);
  });

  it('keeps the same order once attendance changes', () => {
    const before = sortStudentsByName(students).map(item => item.accountId);
    const after = sortStudentsByName(students).map(item => item.accountId);
    expect(after).toEqual(before);
  });
});

describe('sessionActivitySummary', () => {
  it('describes quiz position and captured activity', () => {
    const session: SessionState = {
      status: 'running',
      activity: {
        exerciseIds: ['ex-1'],
        strokes: { zoneA: [] },
        position: { type: 'quiz', index: 2, count: 5, label: 'Fractions' },
        quiz: { history: [{ questionId: 'q1', isCorrect: true, userAnswer: 2 }], answersSnapshot: {} },
      },
    };
    expect(sessionActivitySummary(session)).toMatchObject({
      activityTypeLabel: 'Quiz',
      positionLabel: 'Question 2/5',
      activityCountsLabel: '1 exercice(s) ouvert(s) · 1 question(s) quiz · 1 zone(s) annotée(s)',
    });
  });
});

describe('shouldStartNewSession', () => {
  it('selects a class explicitly only for a fresh start', () => {
    expect(shouldStartNewSession('idle', 'running')).toBe(true);
    expect(shouldStartNewSession('stopped', 'running')).toBe(true);
    expect(shouldStartNewSession('paused', 'running')).toBe(false);
    expect(shouldStartNewSession('running', 'paused')).toBe(false);
    expect(shouldStartNewSession('running', 'stopped')).toBe(false);
  });
});

describe('resolvePilotedClassId', () => {
  const base = { sessionClassId: '1bac', focusClassId: '2bac', accountClassId: 'tc' };

  it.each(['running', 'paused'] as const)(
    'keeps a %s session on its own class, whatever the PC pilots',
    status => {
      expect(resolvePilotedClassId({ ...base, status })).toBe('1bac');
    },
  );

  it.each(['idle', 'stopped'] as const)(
    'follows the piloted class when the session is %s',
    status => {
      expect(resolvePilotedClassId({ ...base, status })).toBe('2bac');
    },
  );

  it('falls back to the last known session class, then to the account class', () => {
    expect(resolvePilotedClassId({ ...base, status: 'idle', focusClassId: '' })).toBe('1bac');
    expect(resolvePilotedClassId({ ...base, status: 'idle', focusClassId: '', sessionClassId: '' })).toBe('tc');
  });

  it('does not let an empty session class strand a live session', () => {
    expect(resolvePilotedClassId({ ...base, status: 'running', sessionClassId: '' })).toBe('2bac');
  });
});

describe('session archive helpers', () => {
  it('formats short and long durations', () => {
    expect(formatDuration(0, 45 * 60_000)).toBe('45 min');
    expect(formatDuration(0, 95 * 60_000)).toBe('1 h 35 min');
  });

  it('sorts archives from newest to oldest without mutating input', () => {
    const entry = (id: string, startedAt: number): ArchivedSessionSummary => ({ id, startedAt, endedAt: startedAt + 1, classId: 'a', chapterTitle: '', exercisesCount: 0, annotatedZones: 0, quizAnswered: 0, presentCount: 0 });
    const source = [entry('old', 1), entry('new', 3), entry('middle', 2)];
    expect(sortSessionArchives(source).map(item => item.id)).toEqual(['new', 'middle', 'old']);
    expect(source.map(item => item.id)).toEqual(['old', 'new', 'middle']);
  });
});
