
import { QuizQuestion, QuizQuestionType } from "../types";
import { QUIZ_TYPE_ALIASES, TIMING } from "../utils/constants";
import { resolveDataUrl } from "./contentOverrides";

// --- UTILITY: Normalize strings for fuzzy matching ---
const normalize = (str: string): string => {
  if (typeof str !== 'string') return String(str);
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, ' ')
    .trim();
};

// --- UTILITY: Resolve type aliases ---
const resolveType = (type: string): QuizQuestionType => {
  return (QUIZ_TYPE_ALIASES[type] || type) as QuizQuestionType;
};

// --- QUIZ SERVICE ---
export const quizService = {
  /**
   * Fetches the quiz for a specific class and chapter.
   * Path: public/data/{classId}/{chapterId}/quiz/{chapterId}_quiz.json
   * Or uses the custom path from manifest if provided.
   */
  async getQuiz(classId: string, chapterId: string, customPath?: string): Promise<QuizQuestion[]> {
    try {
      const path = customPath
        ? `/${customPath.startsWith('/') ? customPath.slice(1) : customPath}`
        : `/data/${classId}/${chapterId}/quiz/${chapterId}_quiz.json`;

      const response = await fetch(await resolveDataUrl(path));

      if (!response.ok) {
        // Silently return empty for missing quizzes - this is expected for many chapters
        return [];
      }

      const data = await response.json();
      const rawQuestions = data.questions || [];

      return rawQuestions.map((q: any) => this.parseQuestion(q)).filter(Boolean);
    } catch (e) {
      // Only log actual parsing errors, not 404s
      if (!(e instanceof SyntaxError)) {
        console.error("[QuizService] Load error", e);
      }
      return [];
    }
  },

  /**
   * Parses a raw question from JSON to typed QuizQuestion
   */
  parseQuestion(q: any): QuizQuestion | null {
    const type = resolveType(q.type);
    
    // --- RADICAL TIMING RESOLUTION ---
    // 1. URL Parameter (Highest priority, for instant debugging: ?forceTime=15)
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlTime = urlParams?.get('forceTime');

    let finalTimeLimit: number = TIMING.QUIZ_DEFAULT_TIME;
    if (urlTime && !isNaN(parseInt(urlTime))) {
      finalTimeLimit = parseInt(urlTime, 10);
    } 
    // 2. Forced Global Override (Ignores JSON)
    else if (TIMING.FORCE_GLOBAL_QUIZ_TIME) {
      finalTimeLimit = TIMING.QUIZ_DEFAULT_TIME;
    } 
    // 3. Standard behavior (JSON first, then default)
    else {
      finalTimeLimit = q.timeLimit || TIMING.QUIZ_DEFAULT_TIME;
    }

    const base = {
      id: q.id,
      type,
      prompt: q.question || q.prompt,
      explanation: q.explanation,
      section: q.section,
      category: q.category,
      timeLimit: finalTimeLimit,
      difficulty: q.difficulty,
      image: q.image,
      media: q.media,
    };

    switch (type) {
      case 'mcq':
        return {
          ...base,
          type: 'mcq',
          options: q.options.map((opt: any, idx: number) => ({
            id: opt.id || `opt-${idx}`,
            text: opt.text,
            isCorrect: opt.is_correct || opt.isCorrect || false
          }))
        };

      case 'boolean':
        return {
          ...base,
          type: 'boolean',
          isTrue: typeof q.isTrue === 'boolean' ? q.isTrue : (q.correctAnswer === 'true')
        };

      case 'order': {
        let correctOrderIds = q.correctOrder;
        if (!correctOrderIds && q.items?.[0]?.correctOrder !== undefined) {
          correctOrderIds = q.items
            .sort((a: any, b: any) => a.correctOrder - b.correctOrder)
            .map((i: any) => i.id);
        }
        return {
          ...base,
          type: 'order',
          items: q.items.map((item: any) => ({
            id: String(item.id),
            content: item.text || item.content
          })),
          correctOrder: (correctOrderIds || []).map(String)
        };
      }

      case 'error':
        return {
          ...base,
          type: 'error',
          context: q.context,
          steps: q.steps
        };

      case 'input':
        return {
          ...base,
          type: 'input',
          correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [q.correctAnswer],
          placeholder: q.placeholder || "Saisissez votre réponse..."
        };

      default:
        console.warn(`[QuizService] Unknown question type: ${q.type}`);
        return null;
    }
  },

  /**
   * Validates an answer against the correct answer
   */
  async verifyAnswer(question: QuizQuestion, answer: any): Promise<boolean> {
    if (answer === undefined || answer === null || answer === '') return false;

    switch (question.type) {
      case 'mcq': {
        const opt = question.options.find(o => o.id === answer);
        return opt?.isCorrect || false;
      }
        
      case 'boolean':
        return answer === question.isTrue;
        
      case 'error':
        return question.steps.find(s => s.id === answer)?.isError || false;
        
      case 'order':
        return JSON.stringify(answer) === JSON.stringify(question.correctOrder);
        
      case 'input': {
        const normUser = normalize(String(answer));
        return question.correctAnswers.some(ans => normalize(ans) === normUser);
      }
        
      default:
        return false;
    }
  }
};
