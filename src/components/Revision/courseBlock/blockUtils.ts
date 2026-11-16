import { RevisionBlock } from '../../../types';

// ── Détection / normalisation des types de bloc ──────────────────────
export const EXAMPLE_QUESTION_PATTERN = /\\(?:question|qst)\{/;
const QUESTION_COMMANDS = ['\\question{', '\\qst{'];

// La taxonomie des types vit désormais dans `utils/revisionBlockTypes`
// (source unique de vérité). Ces ré-exports préservent l'API historique
// consommée par `CourseBlock`, `FocusOverlay` et `RevisionDocumentEditor`.
export {
    normalizeBlockType,
    REVEALABLE,
    REVEAL_AIDS,
    shouldFlattenReveal,
    STYLISH_QUESTION_TYPES,
    ALL_SEMANTIC,
    ALWAYS_LEFT,
    ENLARGE_TYPES,
    PRACTICE_TYPES,
} from '../../../utils/revisionBlockTypes';

export const getApplicationDifficulty = (difficulty: RevisionBlock['difficulty']) => {
    const parsed = Number(difficulty);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(5, Math.max(1, Math.round(parsed)));
};

// Extrait tous les \question{...} consécutifs depuis le début du contenu
// (espaces/\par ignorés). Retourne { questionStr, restStr } ou null.
export function splitQuestionContent(content: string): { questionStr: string; restStr: string } | null {
    const leadSkip = content.match(/^(\s|\\par\b[^{]?)*/);
    const startOffset = leadSkip ? leadSkip[0].length : 0;

    const getQuestionCommandLength = (source: string, position: number) => {
        const command = QUESTION_COMMANDS.find((candidate) => source.startsWith(candidate, position));
        return command?.length || 0;
    };

    if (!getQuestionCommandLength(content, startOffset)) return null;

    const questionParts: string[] = [];
    let pos = startOffset;

    while (pos < content.length) {
        const skipMatch = content.slice(pos).match(/^(\s|\\par\b[^{]?)*/);
        const skipLen = skipMatch ? skipMatch[0].length : 0;

        const commandLength = getQuestionCommandLength(content, pos + skipLen);
        if (!commandLength) break;
        pos += skipLen;

        // Extraire ce \question{...} par comptage de profondeur d'accolades
        let depth = 1;
        let i = pos + commandLength;
        while (i < content.length && depth > 0) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') depth--;
            i++;
        }
        if (depth !== 0) break; // accolades mal équilibrées

        questionParts.push(content.slice(pos, i));
        pos = i;
    }

    if (questionParts.length === 0) return null;
    return { questionStr: questionParts.join('\n'), restStr: content.slice(pos) };
}

// Les jeux de types (`REVEALABLE`, `ALL_SEMANTIC`, `ALWAYS_LEFT`, …) sont
// ré-exportés depuis `utils/revisionBlockTypes` en tête de fichier.
