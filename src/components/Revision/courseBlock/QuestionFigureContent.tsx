import React from 'react';
import type { MediaConfig } from '../../../types';
import { mediaFromImages, mediaImages } from '../../../utils/mediaGallery';
import { sliceContentForFigures } from '../../../utils/contentQuestions';
import MathRenderer from '../../MathRenderer';
import MediaRenderer from '../../MediaRenderer';

interface QuestionFigureContentProps {
  content: string;
  /** Figures ancrées sur une question de liste (`anchor: 'item'` + `targetItem`). */
  media?: MediaConfig;
  variant?: 'default' | 'application';
  surface?: 'revision';
}

/**
 * Contenu de bloc, avec les figures **posées au niveau d'une question**.
 *
 * Le contenu est coupé autour de chaque question visée : la liste garde sa
 * numérotation de part et d'autre (voir `sliceContentForFigures`), la figure
 * s'insère entre les deux morceaux, et une figure dont la question a disparu
 * est rendue autour du contenu plutôt que perdue.
 */
const QuestionFigureContent: React.FC<QuestionFigureContentProps> = ({ content, media, variant, surface }) => {
  const figures = mediaImages(media).filter(image => image.anchor === 'item' && image.targetItem);

  if (figures.length === 0) {
    return <MathRenderer content={content} fontSize="inherit" enableLongPressHighlight />;
  }

  const { slices, unplaced } = sliceContentForFigures(content, figures);

  return (
    <>
      {slices.map((slice, index) => (
        <React.Fragment key={index}>
          {slice.content
            ? <MathRenderer content={slice.content} listStart={slice.listStart} fontSize="inherit" enableLongPressHighlight />
            : null}
          {slice.figuresAfter.length > 0 && (
            <MediaRenderer media={mediaFromImages(slice.figuresAfter)} variant={variant} surface={surface}>
              <span aria-hidden="true" />
            </MediaRenderer>
          )}
        </React.Fragment>
      ))}
      {unplaced.length > 0 && (
        <MediaRenderer media={mediaFromImages(unplaced)} variant={variant} surface={surface}>
          <span aria-hidden="true" />
        </MediaRenderer>
      )}
    </>
  );
};

export default QuestionFigureContent;
