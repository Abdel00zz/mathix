/**
 * Service de gestion du Web Worker pour le traitement LaTeX
 *
 * Ce service fournit une API Promise-based pour interagir avec le worker
 * et gère le cycle de vie du worker (création, communication, terminaison).
 */

// ============================================================================
// TYPES
// ============================================================================

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

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================================================
// SERVICE
// ============================================================================

class MathWorkerService {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestId = 0;
  private isReady = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private initAttempted = false;
  private usesFallback = false;

  private readonly REQUEST_TIMEOUT = 5000; // 5 secondes

  constructor() {
    // Initialisation differee pour eviter les erreurs au demarrage
  }

  /**
   * Initialise le Web Worker (lazy)
   */
  private initWorker(): void {
    if (this.initAttempted) return;
    this.initAttempted = true;

    if (typeof Worker === 'undefined') {
      this.usesFallback = true;
      return;
    }

    try {
      // Creer le worker avec import dynamique pour Vite
      const workerUrl = new URL('../workers/mathWorker.ts', import.meta.url);
      this.worker = new Worker(workerUrl, { type: 'module' });

      // Creer la promise de ready
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve;
      });

      // Timeout pour le ready - si le worker ne repond pas, utiliser fallback
      const readyTimeout = setTimeout(() => {
        if (!this.isReady) {
          this.usesFallback = true;
          this.readyResolve?.();
        }
      }, 2000);

      // Ecouter les messages
      this.worker.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'READY') {
          clearTimeout(readyTimeout);
        }
        this.handleMessage(event);
      };
      this.worker.onerror = this.handleError.bind(this);

    } catch {
      // Utiliser le fallback silencieusement
      this.usesFallback = true;
      this.isReady = true;
    }
  }

  /**
   * Gère les messages du worker
   */
  private handleMessage(event: MessageEvent): void {
    const { id, type, payload } = event.data;

    // Message de ready initial
    if (type === 'READY') {
      this.isReady = true;
      this.readyResolve?.();
      return;
    }

    // Récupérer la requête en attente
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    // Nettoyer
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    // Résoudre ou rejeter
    if (type === 'ERROR') {
      pending.reject(new Error(payload.error));
    } else {
      pending.resolve(payload);
    }
  }

  /**
   * Gère les erreurs du worker
   */
  private handleError(error: ErrorEvent): void {
    console.error('[MathWorkerService] Worker error:', error);

    // Rejeter toutes les requêtes en attente
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker error'));
    }
    this.pendingRequests.clear();

    // Essayer de recréer le worker
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;

    setTimeout(() => this.initWorker(), 1000);
  }

  /**
   * Envoie un message au worker et retourne une Promise
   */
  private sendMessage<T>(type: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        // Fallback synchrone si pas de worker
        reject(new Error('Worker not available'));
        return;
      }

      const id = `req_${++this.requestId}`;

      // Timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, this.REQUEST_TIMEOUT);

      // Enregistrer la requête
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Envoyer au worker
      this.worker.postMessage({ type, id, payload });
    });
  }

  /**
   * Attend que le worker soit pret
   */
  async waitForReady(): Promise<void> {
    // Initialisation lazy
    this.initWorker();

    if (this.usesFallback || this.isReady) return;
    if (this.readyPromise) await this.readyPromise;
  }

  /**
   * Traite une expression LaTeX
   */
  async processLatex(latex: string, displayMode: boolean = false): Promise<ProcessedLatex> {
    await this.waitForReady();

    // Utiliser le fallback si le worker n'est pas disponible
    if (this.usesFallback || !this.worker) {
      return this.fallbackProcess(latex, displayMode);
    }

    try {
      return await this.sendMessage<ProcessedLatex>('PROCESS_LATEX', { latex, displayMode });
    } catch {
      // Fallback synchrone
      return this.fallbackProcess(latex, displayMode);
    }
  }

  /**
   * Traite un batch d'expressions LaTeX
   */
  async batchProcess(items: Array<{ latex: string; displayMode: boolean }>): Promise<ProcessedLatex[]> {
    await this.waitForReady();

    if (this.usesFallback || !this.worker) {
      return items.map(item => this.fallbackProcess(item.latex, item.displayMode));
    }

    try {
      return await this.sendMessage<ProcessedLatex[]>('BATCH_PROCESS', { items });
    } catch {
      return items.map(item => this.fallbackProcess(item.latex, item.displayMode));
    }
  }

  /**
   * Valide une expression LaTeX
   * NOTE: Le fallback effectue maintenant une validation basique au lieu de retourner toujours true
   */
  async validateLatex(latex: string): Promise<{ isValid: boolean; errors: string[] }> {
    await this.waitForReady();

    if (this.usesFallback || !this.worker) {
      // Fallback avec validation basique synchrone
      return this.fallbackValidate(latex);
    }

    try {
      return await this.sendMessage<{ isValid: boolean; errors: string[] }>('VALIDATE', { latex });
    } catch {
      // Fallback en cas d'erreur avec validation basique
      return this.fallbackValidate(latex);
    }
  }

  /**
   * Validation basique synchrone pour le fallback
   * Vérifie les délimiteurs appariés et les erreurs courantes
   */
  private fallbackValidate(latex: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Vérifier les délimiteurs $ (inline math)
    let dollarCount = 0;
    for (let i = 0; i < latex.length; i++) {
      if (latex[i] === '$') {
        if (latex[i + 1] === '$') {
          i++; // Skip $$
        } else {
          dollarCount++;
        }
      }
    }
    if (dollarCount % 2 !== 0) {
      errors.push('Nombre impair de délimiteurs $ inline');
    }

    // Vérifier les accolades
    let braceCount = 0;
    for (const char of latex) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      if (braceCount < 0) {
        errors.push('Accolade fermante sans ouvrante');
        break;
      }
    }
    if (braceCount > 0) {
      errors.push(`${braceCount} accolade(s) non fermée(s)`);
    }

    // Vérifier \begin{} / \end{} basique
    const beginMatches = latex.match(/\\begin\{([^}]+)\}/g) || [];
    const endMatches = latex.match(/\\end\{([^}]+)\}/g) || [];
    if (beginMatches.length !== endMatches.length) {
      errors.push('Environnements \\begin/\\end non appairés');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Vide le cache du worker
   */
  async clearCache(): Promise<void> {
    if (this.usesFallback || !this.worker) return;
    await this.waitForReady();
    await this.sendMessage('CLEAR_CACHE', {});
  }

  /**
   * Fallback synchrone si le worker n'est pas disponible
   */
  private fallbackProcess(latex: string, displayMode: boolean): ProcessedLatex {
    // Tokenisation basique
    const tokens: LatexToken[] = [{
      type: displayMode ? 'display_math' : 'text',
      content: latex,
      start: 0,
      end: latex.length
    }];

    return {
      original: latex,
      tokens,
      isValid: true,
      errors: [],
      displayMode,
      cached: false
    };
  }

  /**
   * Verifie si le service est disponible (worker ou fallback)
   */
  isAvailable(): boolean {
    return this.usesFallback || (this.worker !== null && this.isReady);
  }

  /**
   * Termine le worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }

    // Nettoyer les requêtes en attente
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker terminated'));
    }
    this.pendingRequests.clear();
  }
}

// Export singleton
export const mathWorkerService = new MathWorkerService();
