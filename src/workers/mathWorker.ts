/**
 * Web Worker pour le traitement LaTeX en arrière-plan
 *
 * Ce worker gère:
 * - Preprocessing des expressions LaTeX
 * - Tokenization et validation
 * - Cache des expressions fréquentes
 * - Batch processing pour optimiser les rendus
 */

// ============================================================================
// TYPES
// ============================================================================

interface WorkerMessage {
  type: 'PROCESS_LATEX' | 'BATCH_PROCESS' | 'VALIDATE' | 'CLEAR_CACHE' | 'GET_CACHE_STATS';
  id: string;
  payload: any;
}

interface ProcessedLatex {
  original: string;
  tokens: LatexToken[];
  isValid: boolean;
  errors: string[];
  displayMode: boolean;
  cached: boolean;
}

interface LatexToken {
  type: 'text' | 'inline_math' | 'display_math' | 'command' | 'environment';
  content: string;
  start: number;
  end: number;
}

// ============================================================================
// CACHE - True LRU Implementation
// ============================================================================

/**
 * LRU Cache with proper eviction policy
 * Uses a Map which maintains insertion order, combined with
 * delete-and-reinsert pattern for LRU behavior
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 500) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used) by delete and re-insert
      this.cache.delete(key);
      this.cache.set(key, value);
      this.hits++;
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: K, value: V): void {
    // If key exists, delete first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }
}

const cache = new LRUCache<string, ProcessedLatex>(500);

const generateCacheKey = (latex: string, displayMode: boolean): string => {
  // FNV-1a hash for better distribution
  let hash = 2166136261;
  const str = `${displayMode ? 'D:' : 'I:'}${latex}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // unsigned 32-bit multiplication
  }
  return hash.toString(36);
};

// ============================================================================
// TOKENIZER
// ============================================================================

const LATEX_PATTERNS = {
  displayMath: /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g,
  inlineMath: /\$[^$\n]+?\$|\\\([^)]*?\\\)/g,
  command: /\\[a-zA-Z]+(?:\{[^}]*\}|\[[^\]]*\])*/g,
  environment: /\\begin\{([^}]+)\}[\s\S]*?\\end\{\1\}/g,
};

const tokenize = (latex: string): LatexToken[] => {
  const tokens: LatexToken[] = [];

  // Extraire les maths display
  const displayMatches = [...latex.matchAll(LATEX_PATTERNS.displayMath)];
  for (const match of displayMatches) {
    if (match.index !== undefined) {
      tokens.push({
        type: 'display_math',
        content: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  // Extraire les maths inline (en évitant les display)
  const inlineMatches = [...latex.matchAll(LATEX_PATTERNS.inlineMath)];
  for (const match of inlineMatches) {
    if (match.index !== undefined) {
      // Vérifier que ce n'est pas dans un display math
      const isInDisplay = displayMatches.some(dm =>
        dm.index !== undefined &&
        match.index! >= dm.index &&
        match.index! < dm.index + dm[0].length
      );
      if (!isInDisplay) {
        tokens.push({
          type: 'inline_math',
          content: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
  }

  // Trier par position
  tokens.sort((a, b) => a.start - b.start);

  // Ajouter les segments de texte
  const allTokens: LatexToken[] = [];
  let lastEnd = 0;

  for (const token of tokens) {
    if (token.start > lastEnd) {
      allTokens.push({
        type: 'text',
        content: latex.slice(lastEnd, token.start),
        start: lastEnd,
        end: token.start
      });
    }
    allTokens.push(token);
    lastEnd = token.end;
  }

  if (lastEnd < latex.length) {
    allTokens.push({
      type: 'text',
      content: latex.slice(lastEnd),
      start: lastEnd,
      end: latex.length
    });
  }

  return allTokens;
};

// ============================================================================
// VALIDATION
// ============================================================================

const validateLatex = (latex: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Vérifier les délimiteurs appairés
  const checkPaired = (open: string, close: string, name: string) => {
    let count = 0;
    let i = 0;
    while (i < latex.length) {
      if (latex.slice(i, i + open.length) === open) {
        count++;
        i += open.length;
      } else if (latex.slice(i, i + close.length) === close) {
        count--;
        i += close.length;
        if (count < 0) {
          errors.push(`${name} fermant sans ouvrant`);
          count = 0;
        }
      } else {
        i++;
      }
    }
    if (count > 0) {
      errors.push(`${count} ${name} non fermé(s)`);
    }
  };

  // Vérifier $...$ (en évitant $$)
  let singleDollarCount = 0;
  for (let i = 0; i < latex.length; i++) {
    if (latex[i] === '$') {
      if (latex[i + 1] === '$') {
        i++; // Passer le $$
      } else {
        singleDollarCount++;
      }
    }
  }
  if (singleDollarCount % 2 !== 0) {
    errors.push('Nombre impair de délimiteurs $ inline');
  }

  checkPaired('$$', '$$', 'délimiteur display math $$');
  checkPaired('\\[', '\\]', 'délimiteur display math \\[\\]');
  checkPaired('\\(', '\\)', 'délimiteur inline math \\(\\)');
  checkPaired('{', '}', 'accolade');
  checkPaired('[', ']', 'crochet');

  // Vérifier les environnements
  const beginMatches = [...latex.matchAll(/\\begin\{([^}]+)\}/g)];
  const endMatches = [...latex.matchAll(/\\end\{([^}]+)\}/g)];

  const beginEnvs = beginMatches.map(m => m[1]);
  const endEnvs = endMatches.map(m => m[1]);

  for (const env of beginEnvs) {
    const beginCount = beginEnvs.filter(e => e === env).length;
    const endCount = endEnvs.filter(e => e === env).length;
    if (beginCount !== endCount) {
      errors.push(`Environnement '${env}' non correctement fermé`);
    }
  }

  return { isValid: errors.length === 0, errors };
};

// ============================================================================
// PROCESSING
// ============================================================================

const processLatex = (latex: string, displayMode: boolean = false): ProcessedLatex => {
  const cacheKey = generateCacheKey(latex, displayMode);

  // Vérifier le cache (utilise la nouvelle API LRU)
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Tokeniser
  const tokens = tokenize(latex);

  // Valider
  const { isValid, errors } = validateLatex(latex);

  const result: ProcessedLatex = {
    original: latex,
    tokens,
    isValid,
    errors,
    displayMode,
    cached: false
  };

  // Mettre en cache (utilise la nouvelle API LRU)
  cache.set(cacheKey, result);

  return result;
};

const batchProcess = (items: Array<{ latex: string; displayMode: boolean }>): ProcessedLatex[] => {
  return items.map(item => processLatex(item.latex, item.displayMode));
};

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, id, payload } = event.data;

  try {
    switch (type) {
      case 'PROCESS_LATEX': {
        const result = processLatex(payload.latex, payload.displayMode);
        self.postMessage({ id, type: 'RESULT', payload: result });
        break;
      }

      case 'BATCH_PROCESS': {
        const results = batchProcess(payload.items);
        self.postMessage({ id, type: 'BATCH_RESULT', payload: results });
        break;
      }

      case 'VALIDATE': {
        const validation = validateLatex(payload.latex);
        self.postMessage({ id, type: 'VALIDATION_RESULT', payload: validation });
        break;
      }

      case 'CLEAR_CACHE': {
        cache.clear();
        self.postMessage({ id, type: 'CACHE_CLEARED', payload: { success: true } });
        break;
      }

      case 'GET_CACHE_STATS': {
        const stats = cache.getStats();
        self.postMessage({ id, type: 'CACHE_STATS', payload: stats });
        break;
      }

      default:
        self.postMessage({ id, type: 'ERROR', payload: { error: `Unknown message type: ${type}` } });
    }
  } catch (error: any) {
    self.postMessage({
      id,
      type: 'ERROR',
      payload: { error: error.message || 'Unknown error' }
    });
  }
};

// Confirmer que le worker est prêt
self.postMessage({ type: 'READY' });