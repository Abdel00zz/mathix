import { Exercise, RevisionSheet, RootManifest, ClassData } from "../types";
import { resolveDataUrl } from "./contentOverrides";

// --- CUSTOM ERROR CLASS FOR SMART DEBUGGING ---
export type ErrorType = 'JSON_SYNTAX' | 'SCHEMA_VALIDATION' | 'NETWORK' | 'LATEX_STRUCTURE';

export class ContentError extends Error {
    type: ErrorType;
    filePath: string;
    details?: string;
    suggestion?: string;

    constructor(type: ErrorType, message: string, filePath: string, details?: string, suggestion?: string) {
        super(message);
        this.name = 'ContentError';
        this.type = type;
        this.filePath = filePath;
        this.details = details;
        this.suggestion = suggestion;
    }
}

// --- SCHEMA VALIDATION HELPERS ---
const validateExerciseSchema = (data: any, filePath: string): void => {
    if (!data) throw new ContentError('SCHEMA_VALIDATION', 'Le fichier est vide ou null', filePath);
    if (!data.id) throw new ContentError('SCHEMA_VALIDATION', 'Champ "id" manquant', filePath, undefined, "Ajoutez un champ 'id' unique.");
    if (!Array.isArray(data.questions)) throw new ContentError('SCHEMA_VALIDATION', 'Champ "questions" manquant ou invalide', filePath, "Le champ 'questions' doit être un tableau.");
};

const validateRevisionSchema = (data: any, filePath: string): void => {
    if (!data) throw new ContentError('SCHEMA_VALIDATION', 'Le fichier est vide', filePath);
    if (!data.header) throw new ContentError('SCHEMA_VALIDATION', 'Champ "header" manquant', filePath);
    if (!Array.isArray(data.sections)) throw new ContentError('SCHEMA_VALIDATION', 'Champ "sections" manquant', filePath, "Le champ 'sections' doit être un tableau.");
};

// --- CACHING SYSTEM ---
const exerciseCache: Record<string, Exercise> = {};
const revisionCache: Record<string, RevisionSheet> = {};
const classDataCache: Record<string, ClassData> = {};
const chapterManifestCache: Record<string, any> = {};
let rootManifestCache: RootManifest | null = null;
let rootManifestInFlight: Promise<RootManifest> | null = null;
let rootManifestEpoch = 0;

// --- SHARED HELPER FOR MEDIA PATHS ---
const resolveMediaPaths = (data: any, filePath: string): any => {
    const lastSlashIndex = filePath.lastIndexOf('/');
    const basePath = lastSlashIndex !== -1 ? filePath.substring(0, lastSlashIndex + 1) : '';
    const isAbsoluteSource = (src: string) => /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src);

    const resolve = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.src && typeof obj.src === 'string' && !isAbsoluteSource(obj.src)) {
            obj.src = basePath + obj.src;
        }
        Object.keys(obj).forEach(key => {
            if (Array.isArray(obj[key])) {
                obj[key].forEach((item: any) => resolve(item));
            } else if (typeof obj[key] === 'object') {
                resolve(obj[key]);
            }
        });
    };
    resolve(data);
    return data;
};

// --- OPTIMIZED FETCH WITH CACHE API (Stale-While-Revalidate) ---
const CACHE_NAME = 'mathplus-data-cache-v7';

// En dev, tout cache (mémoire + Cache API) est court-circuité : l'auteur doit
// voir ses modifications JSON immédiatement, sans double rechargement.
const IS_DEV = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;

// Auto-purge old caches on startup
if (typeof window !== 'undefined' && 'caches' in window) {
    caches.keys().then(keys => {
        keys.forEach(key => {
            if (key !== CACHE_NAME && key.startsWith('mathplus-data-cache')) {
                caches.delete(key);
            }
        });
    });
}

const safeJsonFetch = async (path: string, forceFresh: boolean = false): Promise<any> => {
    if (IS_DEV) forceFresh = true;
    const isCacheSupported = typeof window !== 'undefined' && 'caches' in window;

    // Overrides admin : les chemins remplacés sont servis depuis l'API
    // (l'URL versionnée ?v= sert aussi de clé de cache → invalidation auto).
    const url = await resolveDataUrl(path);

    if (isCacheSupported && !forceFresh) {
        try {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(url);

            if (cachedResponse) {
                // Fetch in background to update cache silently
                fetch(url, { credentials: 'same-origin' }).then(async (res) => {
                    if (res.ok) await cache.put(url, res);
                }).catch(() => { }); // Ignore background fetch errors

                return cachedResponse.json();
            }
        } catch {
            console.warn('[ContentService] Cache API error, falling back to network');
        }
    }

    // Network Fetch
    let response;
    try {
        const sep = url.includes('?') ? '&' : '?';
        response = await fetch(forceFresh ? `${url}${sep}_cb=${Date.now()}` : url, { credentials: 'same-origin' });
    } catch (e: any) {
        throw new ContentError('NETWORK', `Échec de la requête réseau : ${e.message}`, path);
    }

    if (!response.ok) {
        throw new ContentError('NETWORK', `Fichier introuvable ou erreur serveur (Status: ${response.status})`, path, undefined, "Vérifiez que le chemin du fichier est correct dans le manifest.");
    }

    // Save to Cache API for next time
    if (isCacheSupported) {
        try {
            const cache = await caches.open(CACHE_NAME);
            cache.put(url, response.clone());
        } catch {
            // Ignore cache write errors
        }
    }

    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch (e: any) {
        const match = e.message.match(/position (\d+)/);
        let snippet = "";
        let details = e.message;

        if (match && match[1]) {
            const pos = parseInt(match[1], 10);
            const start = Math.max(0, pos - 50);
            const end = Math.min(text.length, pos + 50);
            snippet = text.substring(start, end);
            const marker = "\n" + " ".repeat(pos - start) + "^--- ERREUR ICI";
            details = `Erreur de syntaxe près de : ...${snippet}... \n${marker}`;
        }

        throw new ContentError('JSON_SYNTAX', 'Erreur de syntaxe JSON', path, details, "Vérifiez les virgules manquantes, les accolades non fermées ou les guillemets.");
    }
};

export const contentService = {
    async fetchRootManifest(): Promise<RootManifest> {
        if (!IS_DEV && rootManifestCache) return rootManifestCache;
        if (!rootManifestInFlight) {
            const epoch = rootManifestEpoch;
            rootManifestInFlight = safeJsonFetch('data/manifest.json')
                .then((data) => {
                    if (epoch === rootManifestEpoch) {
                        rootManifestCache = data;
                    }
                    return data;
                })
                .finally(() => {
                    if (epoch === rootManifestEpoch) {
                        rootManifestInFlight = null;
                    }
                });
        }
        return rootManifestInFlight;
    },

    async fetchClassDetails(classId: string): Promise<ClassData | null> {
        if (!IS_DEV && classDataCache[classId]) return classDataCache[classId];

        const root = await this.fetchRootManifest();
        const classRef = root.classes.find(c => c.id === classId);

        if (!classRef) return null;

        const classData: ClassData = await safeJsonFetch(classRef.path);
        classDataCache[classId] = classData;
        return classData;
    },

    async fetchExercise(path: string): Promise<{ data: Exercise | null; error: ContentError | null }> {
        if (!IS_DEV && exerciseCache[path]) return { data: exerciseCache[path], error: null };

        try {
            const data = await safeJsonFetch(path);
            validateExerciseSchema(data, path);
            const resolvedData = resolveMediaPaths(data, path);
            exerciseCache[path] = resolvedData;
            return { data: resolvedData, error: null };
        } catch (error: any) {
            if (error instanceof ContentError) return { data: null, error: error };
            return { data: null, error: new ContentError('SCHEMA_VALIDATION', error.message || 'Erreur inconnue', path) };
        }
    },

    async fetchChapterDetails(classId: string, chapterId: string): Promise<any> {
        const classData = await this.fetchClassDetails(classId);
        if (!classData || !classData.chapters) return null;
        
        const chapterRef: any = classData.chapters.find(c => c.id === chapterId);
        if (!chapterRef) return null;

        if (chapterRef.manifestPath) {
            try {
                const fetchedChapter = !IS_DEV && chapterManifestCache[chapterRef.manifestPath]
                    ? chapterManifestCache[chapterRef.manifestPath]
                    : await safeJsonFetch(chapterRef.manifestPath);
                chapterManifestCache[chapterRef.manifestPath] = fetchedChapter;
                return { ...chapterRef, ...fetchedChapter };
            } catch (e) {
                console.error('[ContentService] Failed to load chapter manifest:', chapterRef.manifestPath, e);
                return chapterRef;
            }
        }
        
        return chapterRef; // Fallback for backward compatibility
    },

    async loadExercisesByClass(classId: string): Promise<Exercise[]> {
        try {
            const classData = await this.fetchClassDetails(classId);
            if (!classData?.chapters) return [];

            const chapters = await Promise.all(
                classData.chapters.map(c => this.fetchChapterDetails(classId, c.id))
            );

            const paths: { path: string, chapterId: string }[] = [];
            chapters.forEach(c => {
                if (c && c.exercises) {
                    c.exercises.forEach((e: any) => paths.push({ path: e.path, chapterId: c.id }));
                }
            });

            const results = await Promise.all(
                paths.map(p => this.fetchExercise(p.path).then(r => ({ ...r, info: p })))
            );

            return results.filter(r => r.data).map(r => {
                const ex = r.data as any;
                ex.classId = classId;
                ex.chapterId = r.info.chapterId;
                return ex;
            });
        } catch { return []; }
    },

    async loadExercisesByChapter(classId: string, chapterId: string): Promise<{ exercises: Exercise[]; errors: ContentError[] }> {
        try {
            const chapter = await this.fetchChapterDetails(classId, chapterId);
            if (!chapter?.exercises) return { exercises: [], errors: [] };

            const results = await Promise.all(
                chapter.exercises.map((e: any) => this.fetchExercise(e.path).then(r => ({ ...r, path: e.path })))
            );

            const errors: ContentError[] = [];
            const exercises: Exercise[] = [];

            results.forEach(r => {
                if (r.error) errors.push(r.error);
                else if (r.data) {
                    const ex = r.data as any;
                    ex.classId = classId;
                    ex.chapterId = chapterId;
                    exercises.push(ex);
                }
            });

            return { exercises, errors };
        } catch {
            return { exercises: [], errors: [] };
        }
    },

    async loadAllExercises(): Promise<Exercise[]> {
        try {
            const root = await this.fetchRootManifest();
            const promises = root.classes.map(c => this.loadExercisesByClass(c.id));
            const results = await Promise.all(promises);
            return results.flat();
        } catch {
            return [];
        }
    },

    clearCache(): void {
        for (const key in exerciseCache) delete exerciseCache[key];
        for (const key in revisionCache) delete revisionCache[key];
        for (const key in classDataCache) delete classDataCache[key];
        for (const key in chapterManifestCache) delete chapterManifestCache[key];
        rootManifestEpoch += 1;
        rootManifestCache = null;
        rootManifestInFlight = null;
    },

    /** Invalidation ciblée à partir des chemins annoncés par le manifeste cloud. */
    invalidatePaths(paths: string[]): void {
        for (const rawPath of paths) {
            const path = rawPath.replace(/^\//, '');
            if (path === 'data/manifest.json') {
                rootManifestEpoch += 1;
                rootManifestCache = null;
                rootManifestInFlight = null;
            }

            const classMatch = path.match(/^data\/classes\/([^/]+)\.json$/);
            if (classMatch) delete classDataCache[classMatch[1]];

            if (/^data\/[^/]+\/[^/]+\/manifest\.json$/.test(path)) {
                delete chapterManifestCache[path];
            }
            if (path.includes('/exercises/')) delete exerciseCache[path];
            if (path.includes('/revisions/')) delete revisionCache[path];
        }
    },

    async fetchRevisionSheet(path: string, forceFresh: boolean = false): Promise<any> {
        if (!IS_DEV && !forceFresh && revisionCache[path]) return revisionCache[path];

        try {
            const data = await safeJsonFetch(path, forceFresh);
            validateRevisionSchema(data, path);
            const resolvedData = resolveMediaPaths(data, path);

            if (!forceFresh) revisionCache[path] = resolvedData;
            return resolvedData;
        } catch (error: any) {
            if (error instanceof ContentError) throw error;
            throw new ContentError('SCHEMA_VALIDATION', error.message || 'Erreur inconnue', path);
        }
    }
};
