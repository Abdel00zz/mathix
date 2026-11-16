import { describe, expect, it } from 'vitest';
import { createDefaultAppSettings } from './constants';

describe('createDefaultAppSettings', () => {
  it('includes every setting required on a fresh installation', () => {
    expect(createDefaultAppSettings()).toMatchObject({
      fontSize: 'base',
      soundEnabled: true,
      reduceMotion: false,
      quizTimePerQuestion: 45,
      tiersTemps: false,
    });
    expect(createDefaultAppSettings().notificationPrefs).toBeDefined();
  });

  it('creates independent nested settings for each caller', () => {
    const first = createDefaultAppSettings();
    const second = createDefaultAppSettings();

    first.notificationPrefs!.categories.revision = false;
    first.revisionBlockVisibility!.summary = false;
    first.revisionBlockNumbering!.definition = false;

    expect(second.notificationPrefs!.categories.revision).toBe(true);
    expect(second.revisionBlockVisibility!.summary).toBe(true);
    expect(second.revisionBlockNumbering!.definition).toBe(true);
  });
});
