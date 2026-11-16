
import { appendHighlightedText } from './textProcessor';
import { ThemeConfig } from '../styles/mathTheme';
import { TOKENIZER_PATTERN } from './parser/regex';
import { readBalancedEnvironment, stripEnvironmentTitle } from './parser/environments';
import { renderSemanticEnv, renderStructuralEnv } from './parser/renderers';
import { readImageCaption, renderImageCommand } from './parser/imageCommand';
import {
  MathNodeFactory,
  renderDisplayMath,
  renderInlineMath,
} from './parser/shared';
import {
  processTextMacro,
  processFormatting,
  processSpacing,
  processSimpleCommand,
  processSection,
  processReference,
} from './parser/tokenProcessor';
import { ContentError } from '../services/contentService';

export { THEME_LIGHT, FONT_SIZES } from '../styles/mathTheme';

/**
 * renderSegment avec injection de contexte didactique.
 * Gère désormais une pile d'identifiants pour le traçage des dépendances.
 */
export function renderSegment(
  text: string,
  target: HTMLElement,
  themeConfig: ThemeConfig,
  createMathNode: MathNodeFactory,
  enableKeywords = false,
  counter?: Map<string, number>
): void {
  if (!text) return;

  try {
      const envCounter = counter || new Map<string, number>();
      const tokenizer = new RegExp(TOKENIZER_PATTERN, 'g');
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let iterations = 0;
      const MAX_ITERATIONS = 5000;

      while ((match = tokenizer.exec(text)) !== null) {
        if (iterations++ > MAX_ITERATIONS) break;

        const groups = match.groups || {};
        const fullMatch = match[0];

        if (match.index > lastIndex) {
          const textSegment = text.slice(lastIndex, match.index);
          appendHighlightedText(target, textSegment, enableKeywords);
        }

        if (groups.semantic) {
          // Environnement sémantique : la fermeture est recalculée par comptage
          // de profondeur (un même environnement peut être imbriqué).
          const balanced = readBalancedEnvironment(text, match.index, groups.semType);
          const semContent = balanced
            ? (groups.semTitle !== undefined ? stripEnvironmentTitle(balanced.content) : balanced.content)
            : groups.semContent;
          renderSemanticEnv(groups.semType, groups.semTitle, semContent, target, themeConfig, createMathNode, enableKeywords, renderSegment, envCounter);
          if (balanced) {
            lastIndex = balanced.endIndex;
            tokenizer.lastIndex = balanced.endIndex;
            continue;
          }
        } else if (groups.structural) {
          // Idem pour les listes : la regex non gloutonne appariait une liste
          // imbriquée avec la fermeture intérieure, laissant `\end{enumerate}`
          // s'afficher en clair.
          const balanced = readBalancedEnvironment(text, match.index, groups.structType);
          renderStructuralEnv(groups.structType, balanced ? balanced.content : groups.structContent, target, themeConfig, createMathNode, enableKeywords, renderSegment, envCounter);
          if (balanced) {
            lastIndex = balanced.endIndex;
            tokenizer.lastIndex = balanced.endIndex;
            continue;
          }
        } else if (groups.displayMath) {
          renderDisplayMath(fullMatch.startsWith('$$') ? fullMatch.slice(2, -2) : fullMatch.slice(2, -2), createMathNode, target);
        } else if (groups.inlineMath) {
          renderInlineMath(fullMatch.startsWith('$') ? fullMatch.slice(1, -1) : fullMatch.slice(2, -2), createMathNode, target, themeConfig.mathText);
        } else if (groups.image) {
          // `\image[options]{src}` puis, collée, la légende facultative `{…}`.
          const caption = readImageCaption(text, match.index + fullMatch.length);
          renderImageCommand(groups.imgSrc, groups.imgOpts, caption?.content, target, (el, captionText) => {
            renderSegment(captionText, el, themeConfig, createMathNode, enableKeywords, envCounter);
          });
          if (caption) {
            lastIndex = caption.endIndex;
            tokenizer.lastIndex = caption.endIndex;
            continue;
          }
        } else if (groups.textMacro) {
          const newIndex = processTextMacro(groups.macroCmd, text, match.index, fullMatch.length, target, themeConfig, createMathNode, enableKeywords, renderSegment, envCounter);
          if (newIndex > 0) { lastIndex = newIndex; tokenizer.lastIndex = newIndex; continue; }
        } else if (groups.formatting) {
          processFormatting(fullMatch, target, themeConfig, createMathNode, enableKeywords, renderSegment, envCounter);
        } else if (groups.spacing) {
          processSpacing(fullMatch, target);
        } else if (groups.simpleCmd) {
          processSimpleCommand(fullMatch, target);
        } else if (groups.sectioning) {
          const newIndex = processSection(groups.secLevel, text, match.index, fullMatch.length, target, themeConfig, createMathNode, enableKeywords, renderSegment, envCounter);
          if (newIndex > 0) { lastIndex = newIndex; tokenizer.lastIndex = newIndex; continue; }
        } else if (groups.reference) {
          const newIndex = processReference(groups.refType, text, match.index, fullMatch.length, target);
          if (newIndex > 0) { lastIndex = newIndex; tokenizer.lastIndex = newIndex; continue; }
        }

        lastIndex = match.index + fullMatch.length;
      }

      if (lastIndex < text.length) {
        appendHighlightedText(target, text.slice(lastIndex), enableKeywords);
      }

  } catch (e: any) {
      throw new ContentError('LATEX_STRUCTURE', `Erreur didactique : ${e.message}`, "Parser Core", text.substring(0, 50));
  }
}
