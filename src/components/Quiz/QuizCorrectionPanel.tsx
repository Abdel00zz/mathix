import React from 'react';
import MathRenderer from '../MathRenderer';
import type { QuizCorrectionDigest } from './quizCorrection';

/**
 * Volet « Aide » de la zone manuscrite du quiz : uniquement le rappel de cours.
 *
 * Les propositions (avec leur état) restent visibles sur la question, les
 * réponses des élèves dans « Mes élèves présents » ; ici ne reste que ce qu'on
 * ne voit pas ailleurs — la justification. Il se glisse dans le bandeau de
 * `InlineCanvasZone`, au-dessus de la surface d'écriture.
 */
const QuizCorrectionPanel: React.FC<{ digest: QuizCorrectionDigest }> = ({ digest }) => {
  if (!digest.explanation) return null;
  return (
    <div className="typo-ui text-[clamp(0.9rem,0.86rem_+_0.2vw,1.02rem)] leading-relaxed text-slate-700 [&_.katex]:text-[1em]">
      <MathRenderer content={digest.explanation} fontSize="inherit" enableKeywords={false} />
    </div>
  );
};

export default React.memo(QuizCorrectionPanel);
