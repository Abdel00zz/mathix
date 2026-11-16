import React from 'react';
import MediaRenderer from '../../MediaRenderer';
import { MediaConfig, RevisionBlock } from '../../../types';
import { findContentQuestions } from '../../../utils/contentQuestions';
import { mediaByAnchor, withoutAnchor } from '../../../utils/mediaGallery';
import { useProfPersonalization } from '../../../hooks/useProfPersonalization';
import BlockHeader from '../BlockHeader';
import ExampleExpandableContent from './ExampleExpandableContent';
import QuestionFigureContent from './QuestionFigureContent';
import { splitQuestionContent } from './blockUtils';

interface ApplicationBlockContentProps {
  block: RevisionBlock;
  typeKey: string;
  label: string;
  number?: number;
  contentStr: string;
  contentClassName: string;
}

const wrapMedia = (media: MediaConfig | undefined, node: React.ReactNode) =>
  media?.src ? (
    <MediaRenderer media={media} surface="revision" variant="application">
      {node}
    </MediaRenderer>
  ) : (
    <>{node}</>
  );

export const ApplicationBlockContent: React.FC<ApplicationBlockContentProps> = ({
  block,
  typeKey,
  label,
  number,
  contentStr,
  contentClassName,
}) => {
  const itemMedia = mediaByAnchor(block.media, 'item');
  const questionSplit = splitQuestionContent(contentStr);

  const renderSemanticContent = (media = itemMedia) => (
    <div className={contentClassName}>
      <QuestionFigureContent content={contentStr} media={media} surface="revision" variant="application" />
    </div>
  );

  const questionSource = questionSplit?.questionStr || contentStr;
  const correctionSource = questionSplit?.restStr || '';
  const questionFigures = itemMedia && findContentQuestions(questionSource).length > 0 ? itemMedia : undefined;
  const correctionFigures = itemMedia && findContentQuestions(correctionSource).length > 0 ? itemMedia : undefined;
  const looseItemFigures = questionFigures || correctionFigures ? undefined : itemMedia;
  const correctionContent = questionSplit?.restStr;

  const renderApplicationQuestion = () => (
    <div className={contentClassName}>
      <QuestionFigureContent
        content={questionSplit?.questionStr || contentStr}
        media={questionFigures || looseItemFigures}
        surface="revision"
        variant="application"
      />
    </div>
  );

  const renderApplicationCorrection = () => (
    <div className={contentClassName}>
      <QuestionFigureContent
        content={correctionContent || questionSplit?.restStr || contentStr}
        media={correctionFigures || looseItemFigures}
        surface="revision"
        variant="application"
      />
    </div>
  );

  const { revision: revisionPrefs } = useProfPersonalization();
  const showSolutions = revisionPrefs.showSolutions !== false;
  const hasCorrection = !!questionSplit?.restStr.trim();
  const leadMedia = mediaByAnchor(block.media, 'lead', 'application');
  const correctionMedia = mediaByAnchor(block.media, 'content', 'application');
  const applicationMedia = hasCorrection && showSolutions ? undefined : withoutAnchor(block.media, 'item');

  return (
    <>
      <BlockHeader type={typeKey} label={label} title={block.title} number={number} />
      {questionSplit ? (
        hasCorrection && showSolutions ? (
          <ExampleExpandableContent leadContent={wrapMedia(leadMedia, renderApplicationQuestion())}>
            {wrapMedia(correctionMedia, renderApplicationCorrection())}
          </ExampleExpandableContent>
        ) : (
          wrapMedia(applicationMedia || leadMedia, renderApplicationQuestion())
        )
      ) : (
        <ExampleExpandableContent>
          {wrapMedia(applicationMedia, renderSemanticContent())}
        </ExampleExpandableContent>
      )}
    </>
  );
};
