
// ============================================================================
// LOG SERVICE - Centralized logging for MathPlus
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Détection sécurisée de l'environnement de développement.
 * Évite l'erreur "Cannot read properties of undefined (reading 'DEV')"
 */
const getIsDev = (): boolean => {
  try {
    // Vérification progressive de la chaîne import.meta -> env -> DEV
    if (typeof import.meta === 'undefined') return false;
    const meta = import.meta as any;
    if (!meta.env) return false;
    return !!meta.env.DEV;
  } catch {
    return false;
  }
};

const isDev = getIsDev();

interface LogOptions {
  /** Optional context identifier for the log (e.g., component name) */
  context?: string;
  /** Whether to log even in production */
  forceLog?: boolean;
}

/**
 * Formats a log message with timestamp and context
 */
const formatMessage = (level: LogLevel, message: string, context?: string): string => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}]` : '';
  return `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${message}`;
};

/**
 * Centralized logger service
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.debug(formatMessage('debug', message), ...args);
    }
  },

  info: (message: string, options?: LogOptions, ...args: unknown[]) => {
    if (isDev || options?.forceLog) {
      console.info(formatMessage('info', message, options?.context), ...args);
    }
  },

  warn: (message: string, options?: LogOptions, ...args: unknown[]) => {
    console.warn(formatMessage('warn', message, options?.context), ...args);
  },

  error: (message: string, error?: Error | unknown, options?: LogOptions) => {
    const formattedMessage = formatMessage('error', message, options?.context);
    console.error(formattedMessage, error);
  },

  group: (label: string, collapsed = true) => {
    if (isDev) {
      if (collapsed) {
        console.groupCollapsed(label);
      } else {
        console.group(label);
      }
    }
  },

  groupEnd: () => {
    if (isDev) {
      console.groupEnd();
    }
  },

  time: (label: string) => {
    if (isDev) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (isDev) {
      console.timeEnd(label);
    }
  }
};
