import React from 'react';
import PrintableChapterExercises from '../Exercise/PrintableChapterExercises';
import PrintSurface from '../Exercise/print/PrintSurface';
import MathRenderer from '../MathRenderer';
import { DEFAULT_PRINT_LAYOUT } from '../../services/printLayout';
import type { SessionPrintPayload } from '../../services/sessionArchiveService';

/** Formate un classId en nom de classe lisible (même logique que le rendu exercices). */
const formatClassLabel = (classId?: string): string => {
  if (!classId) return '';
  return classId
    .replace(/-/g, ' ')
    .replace(/math[ée]matiques?/gi, 'Math')
    .replace(/exp[ée]rimentales?/gi, 'Exp')
    .replace(/sciences?/gi, 'Sciences')
    .replace(/\b(tc|TC)\b/g, 'Tronc Commun')
    .replace(/\b(1ere|1ère)\b/gi, '1ère')
    .replace(/\b(2eme|2ème)\b/gi, '2ème')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Rendu imprimable d'une séance archivée : en-tête d'archive, élèves présents,
 * questions de quiz remplies (zones contenant du texte uniquement), récapitulatif
 * des zones manuscrites annotées, puis les exercices du chapitre au format
 * académique (composant séparé). Monté uniquement à l'impression (`.print-only`).
 */
export default function PrintableSession({ payload }: { payload: SessionPrintPayload }) {
  const { classId, chapterTitle, sessionStartedAt, presentStudents, exercises, strokes, quizAnswered, options } = payload;
  const layout = payload.layout ?? DEFAULT_PRINT_LAYOUT;

  const dateLabel = sessionStartedAt
    ? new Date(sessionStartedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const showArchive = !!(options.includeStudents || quizAnswered.length > 0 || dateLabel);

  return (
    <div className="print-only">
      <PrintSurface layout={layout}>
      {showArchive && (
        <div className="print-document" style={{ backgroundColor: '#ffffff', background: '#ffffff' }}>
          <header className="print-sheet-header">
            <div className="print-sheet-topline">
              <div className="print-brand-block">
                <h1 className="print-brand typo-ui">Archive de séance</h1>
                <p className="print-brand-caption">monProf</p>
              </div>
              <div className="print-meta-block">
                {classId && <p className="print-class-label">{formatClassLabel(classId)}</p>}
                {dateLabel && <p className="print-year-label">{dateLabel}</p>}
              </div>
            </div>
            <div className="print-title-wrap">
              <div className="print-title-card">
                <p className="print-title typo-ui">
                  <span className="print-title-kicker">Chapitre</span>
                  <MathRenderer inline content={chapterTitle} fontSize="inherit" className="typo-title-mono" />
                </p>
              </div>
            </div>
          </header>

          {options.includeStudents && presentStudents.length > 0 && (
            <section className="print-session-section">
              <h2 className="print-section-title">Élèves présents ({presentStudents.length})</h2>
              <p className="print-section-body">{presentStudents.join(' · ')}</p>
            </section>
          )}

          {quizAnswered.length > 0 && (
            <section className="print-session-section">
              <h2 className="print-section-title">Quiz — réponses renseignées ({quizAnswered.length})</h2>
              <div className="print-quiz-list">
                {quizAnswered.map((item, index) => (
                  <div key={item.question.id} className="print-quiz-item">
                    <p className="print-quiz-q">
                      <strong>{index + 1}.</strong>{' '}
                      <MathRenderer inline content={item.question.prompt} fontSize="inherit" />
                    </p>
                    <p className="print-quiz-a">
                      <span className="print-quiz-a-label">Réponse :</span>{' '}
                      {item.isCorrect === true && <span style={{ color: '#15803d', fontWeight: 700 }}>✓ </span>}
                      {item.isCorrect === false && <span style={{ color: '#b91c1c', fontWeight: 700 }}>✗ </span>}
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {exercises.length > 0 && (
        <PrintableChapterExercises
          chapterTitle={chapterTitle}
          classId={classId}
          exercises={exercises}
          startIndex={layout.content.startIndex}
          showCorrections={options.includeCorrections}
          hideTeacherName
          hideHeader={showArchive}
          strokes={options.includeAnnotations ? strokes : undefined}
          showAnswerSpaces={options.includeAnnotations}
          answerSpaceStyle={layout.content.answerSpaceStyle}
          answerSpaceColor={layout.content.answerSpaceColor}
          exercisePerPage={layout.content.exercisePerPage}
        />
      )}
      </PrintSurface>
    </div>
  );
}
