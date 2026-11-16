import { afterEach, describe, expect, it, vi } from 'vitest';
import { chapterStatsService } from './chapterStatsService';
import { quizService } from './quizService';

describe('chapterStatsService quiz counts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('utilise le compteur publié sans télécharger le fichier du quiz', async () => {
    const getQuiz = vi.spyOn(quizService, 'getQuiz');
    await expect(chapterStatsService._resolveQuizCount('classe', {
      id: 'chapitre',
      quizCount: 26,
      quizzes: [{ path: 'data/classe/chapitre/quiz/principal.json' }],
    })).resolves.toBe(26);
    expect(getQuiz).not.toHaveBeenCalled();
  });

  it('ne charge que le quiz principal lorsque le compteur est absent', async () => {
    const getQuiz = vi.spyOn(quizService, 'getQuiz').mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      id: `q${index + 1}`,
      type: 'boolean' as const,
      prompt: 'Question',
      isTrue: true,
    })));
    await expect(chapterStatsService._resolveQuizCount('classe', {
      id: 'chapitre',
      quizCount: 0,
      quizzes: [
        { path: 'data/classe/chapitre/quiz/principal.json' },
        { path: 'data/classe/chapitre/quiz/secondaire.json' },
      ],
    })).resolves.toBe(4);
    expect(getQuiz).toHaveBeenCalledTimes(1);
    expect(getQuiz).toHaveBeenCalledWith('classe', 'chapitre', 'data/classe/chapitre/quiz/principal.json');
  });
});
