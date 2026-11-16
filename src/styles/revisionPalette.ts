type PaletteFamily =
  | 'definition'
  | 'theory'
  | 'application'
  | 'method'
  | 'practice'
  | 'note'
  | 'warning'
  | 'neutral';

interface FamilyTokens {
  bg: string;
  bgSoft: string;
  border: string;
  accent: string;
  glow: string;
}

// Les valeurs vivent dans styles/revision/revision-tokens.css (source de
// vérité unique) : ici on ne garde que des références, utilisables aussi bien
// dans un attribut style que dans color-mix().
const familyTokens = (name: PaletteFamily): FamilyTokens => ({
  bg: `var(--rev-${name}-bg)`,
  bgSoft: `var(--rev-${name}-soft)`,
  border: `var(--rev-${name}-border)`,
  accent: `var(--rev-${name}-accent)`,
  glow: `var(--rev-${name}-glow)`,
});

const FAMILIES: Record<PaletteFamily, FamilyTokens> = {
  definition: familyTokens('definition'),
  theory: familyTokens('theory'),
  application: familyTokens('application'),
  method: familyTokens('method'),
  practice: familyTokens('practice'),
  note: familyTokens('note'),
  warning: familyTokens('warning'),
  neutral: familyTokens('neutral'),
};
const BLOCK_FAMILY: Record<string, PaletteFamily> = {
  definition: 'definition', theorem: 'theory', proposition: 'theory', property: 'theory',
  cela_permet_de: 'note',
  lemma: 'theory', corollary: 'theory', consequence: 'theory',
  method: 'method', technique: 'method', strategy: 'method', rappel: 'method',
  application: 'application', example: 'practice', problem: 'practice',
  solution: 'practice', hint: 'practice',
  remark: 'note', note: 'note', intuition: 'note', summary: 'note', exploration: 'note',
  warning: 'warning', proof: 'neutral', intro: 'neutral',
};

const FILLED = new Set<string>([
  'definition', 'theorem', 'proposition', 'property', 'lemma', 'corollary', 'consequence',
  'method', 'technique', 'strategy', 'rappel', 'problem', 'hint', 'solution',
  'note', 'summary', 'warning',
]);

const familyOf = (type: string): PaletteFamily => BLOCK_FAMILY[type] ?? 'neutral';

const accentOf = (type: string): string => FAMILIES[familyOf(type)].accent;
export const tokensOf = (type: string): FamilyTokens => FAMILIES[familyOf(type)];

export const cardFillStyle = (type: string): Record<string, string> | undefined => {
  if (!FILLED.has(type)) return undefined;
  const { bg, bgSoft, border, glow, accent } = FAMILIES[familyOf(type)];
  return {
    backgroundColor: bg,
    borderColor: border,
    '--mathqst-color': accent,
    '--mathqst-fill': bg,
    '--mathqst-fill-soft': bgSoft,
    '--mathqst-border': border,
    '--mathqst-glow': glow,
  };
};

export const ACCENT_BY_TYPE: Record<string, string> = Object.fromEntries(
  Object.keys(BLOCK_FAMILY).map((type) => [type, accentOf(type)])
);
