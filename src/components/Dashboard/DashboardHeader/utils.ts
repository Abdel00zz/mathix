const WINDOWS_1252_BYTES: Record<string, number> = {
    '€': 0x80,
    '‚': 0x82,
    'ƒ': 0x83,
    '„': 0x84,
    '…': 0x85,
    '†': 0x86,
    '‡': 0x87,
    'ˆ': 0x88,
    '‰': 0x89,
    'Š': 0x8a,
    '‹': 0x8b,
    'Œ': 0x8c,
    'Ž': 0x8e,
    '‘': 0x91,
    '’': 0x92,
    '“': 0x93,
    '”': 0x94,
    '•': 0x95,
    '–': 0x96,
    '—': 0x97,
    '˜': 0x98,
    '™': 0x99,
    'š': 0x9a,
    '›': 0x9b,
    'œ': 0x9c,
    'ž': 0x9e,
    'Ÿ': 0x9f,
};

const repairMojibake = (value: string): string => {
    if (!value || !/[ÃÂâ]/.test(value)) return value;

    try {
        const bytes = Uint8Array.from(
            Array.from(value).map((char) => {
                const mapped = WINDOWS_1252_BYTES[char];
                if (mapped !== undefined) return mapped;

                const code = char.charCodeAt(0);
                return code <= 0xff ? code : 0x3f;
            })
        );

        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return value;
    }
};

export const toSentenceCase = (value: string): string => {
    const normalized = repairMojibake((value || '').trim()).toLocaleLowerCase('fr-FR');
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const formatStudyTime = (seconds = 0): string => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours <= 0) return `${Math.max(minutes, 0)} min`;
    return `${hours} h ${String(rest).padStart(2, '0')}`;
};

export const getEyebrow = (className?: string): string => {
    const repaired = repairMojibake(className || '').trim();
    if (!repaired) return 'monProf';
    return repaired;
};

export const getTitle = (activeSectionId?: string, activeSectionTitle?: string): string => {
    if (activeSectionId === 'chapitres') return "Programme d'Analyse & Algèbre";
    if (activeSectionId === 'examens') return 'Examens Nationaux';
    if (activeSectionId === 'problemes') return 'Problèmes & Raisonnement';
    if (activeSectionId === 'olympiad') return 'Olympiades Mathématiques';
    if (activeSectionTitle) return activeSectionTitle;
    return "Programme d'Analyse & Algèbre";
};
