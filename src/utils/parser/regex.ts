
import { SEMANTIC_ENVIRONMENTS, STRUCTURAL_ENVIRONMENTS, TEXT_MACRO_LIST } from './dictionaries';

const ENV_KEYS = SEMANTIC_ENVIRONMENTS.join('|');
const STRUCT_KEYS = STRUCTURAL_ENVIRONMENTS.join('|');
const MACRO_KEYS = TEXT_MACRO_LIST.join('|');

// Utilisation de groupes nommés (?<name>...) pour une identification plus claire dans le parseur
const PATTERN_PARTS = [
  // 1. Environnements sémantiques: \begin{definition}[titre]...\end{definition}
  `(?<semantic>\\\\begin\\{(?<semType>${ENV_KEYS})\\}(?:\\[(?<semTitle>[^\\]]*)\\])?(?<semContent>[\\s\\S]*?)\\\\end\\{\\k<semType>\\})`,

  // 2. Environnements structurels: \begin{itemize}...\end{itemize}
  `(?<structural>\\\\begin\\{(?<structType>${STRUCT_KEYS})\\}(?<structContent>[\\s\\S]*?)\\\\end\\{\\k<structType>\\})`,

  // 3. Display Math: $$...$$ ou \[...\]
  `(?<displayMath>\\$\\$[\\s\\S]+?\\$\\$|\\\\\\[[\\s\\S]+?\\\\\\])`,

  // 4. Inline Math: $...$ ou \(...\)
  `(?<inlineMath>\\$[^$]+?\\$|\\\\\\([^)]+?\\\\\\))`,

  // 4 bis. Image : \image[options]{src}  (la légende éventuelle, un second
  // argument { … }, est lue par le parseur car elle peut contenir des accolades).
  `(?<image>\\\\(?:image|img|includegraphics)(?![a-zA-Z])(?:\\[(?<imgOpts>[^\\]]*)\\])?\\{(?<imgSrc>[^{}]*)\\})`,

  // 5. Macros de texte avec argument: \textbf{...}
  `(?<textMacro>\\\\(?<macroCmd>${MACRO_KEYS})\\{)`,

  // 6. Formatage simple
  `(?<formatting>\\\\\\\\(?:\\\\[[^\\\\\\]]*\\\\])?|\\*\\*[^*]+\\*\\*|__[^_]+__)`,

  // 7. Espacement
  `(?<spacing>\\\\(?:quad|qquad|\\,|;|:|!))`,

  // 8. Commandes simples sans arguments - On autorise les majuscules après pour corriger \smallskipCes
  `(?<simpleCmd>\\\\(?:item|par|newline|smallskip|medskip|bigskip|noindent|indent|method|step|tip|warning|analyze|recall|og|fg|columnbreak|column)(?![a-z])|\\\\fg\\{\\})`,

  // 9. Sections
  `(?<sectioning>\\\\(?<secLevel>section|subsection|subsubsection|paragraph|subparagraph)\\{)`,

  // 10. Références
  `(?<reference>\\\\(?<refType>ref|label|eqref|cite|pageref)\\{)`,
];

export const TOKENIZER_PATTERN = PATTERN_PARTS.join('|');
