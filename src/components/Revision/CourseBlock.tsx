import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import MathRenderer from '../MathRenderer';
import MediaRenderer from '../MediaRenderer';
import { RevisionBlock } from '../../types';
import { mediaByAnchor, withoutAnchor } from '../../utils/mediaGallery';
import { ENV_LABELS, ENV_STYLES, ENV_COLORS } from '../../styles/mathTheme';
import BlockHeader, { RevisionBadge } from './BlockHeader';
import { QuestionGlyph, RevisionBackground } from './RevisionArtwork';
import { cardFillStyle } from '../../styles/revisionPalette';
import ApplicationDifficultyStars from './courseBlock/ApplicationDifficultyStars';
import IntroBlock from './courseBlock/IntroBlock';
import CelaPermetDeBlock from './courseBlock/CelaPermetDeBlock';
import QuestionFigureContent from './courseBlock/QuestionFigureContent';
import { RevealPanel, RevealToggleButton } from './courseBlock/RevealPanel';
import { ApplicationBlockContent } from './courseBlock/ApplicationBlockContent';
import { useFocusMode } from './FocusModeContext';
import { useProfPersonalization } from '../../hooks/useProfPersonalization';
import {
  EXAMPLE_QUESTION_PATTERN,
  PRACTICE_TYPES,
  normalizeBlockType,
  getApplicationDifficulty,
  REVEALABLE,
  shouldFlattenReveal,
  STYLISH_QUESTION_TYPES,
  ALL_SEMANTIC,
  ALWAYS_LEFT,
  ENLARGE_TYPES,
} from './courseBlock/blockUtils';

interface CourseBlockProps {
  block: RevisionBlock;
  number?: number;
}

const CourseBlock: React.FC<CourseBlockProps> = ({ block, number }) => {
  const typeKey = normalizeBlockType(block.type);
  const isInitiallyRevealed = block.type === 'problem';
  const [isRevealed, setIsRevealed] = useState(isInitiallyRevealed);
  const [hasOpenedReveal, setHasOpenedReveal] = useState(isInitiallyRevealed);
  const [isInView, setIsInView] = useState(
    () => typeof window !== 'undefined' && !('IntersectionObserver' in window)
  );
  const revealContentId = useId();
  const { focusBlock } = useFocusMode();
  const { revision: revisionPrefs } = useProfPersonalization();
  const blockRef = useRef<HTMLDivElement>(null);

  // Apparition calme en une seule passe à l'entrée dans le viewport :
  // on ne replie plus automatiquement les encadrés ouverts au scroll pour éviter
  // les sauts de hauteur intempestifs pendant la lecture comparée.
  useEffect(() => {
    const el = blockRef.current;
    if (!el || typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true);
          el.classList.add('revision-in-view');
          observer.disconnect();
        }
      },
      {
        rootMargin: '80px 0px 80px 0px',
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const blockTypeKey = normalizeBlockType(block.type);
  const showSolutions = revisionPrefs.showSolutions !== false;
  const flatReveal = shouldFlattenReveal(blockTypeKey, revisionPrefs.showBlockTitles);
  const revealOpen = flatReveal || isRevealed;

  const toggleReveal = useCallback(() => {
    setHasOpenedReveal(true);
    setIsRevealed((prev) => !prev);
  }, []);

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('.revision-correction-toggle') ||
      target.closest('.revision-reveal-toggle') ||
      target.closest('.revision-badge-toggle')
    ) {
      return;
    }
    e.stopPropagation();

    if (REVEALABLE.has(typeKey) && !isRevealed && !flatReveal) {
      toggleReveal();
      return;
    }

    focusBlock(block, number);
  };

  const handleFocusKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.key !== 'Enter') return;
    event.preventDefault();

    if (REVEALABLE.has(typeKey) && !isRevealed && !flatReveal) {
      toggleReveal();
      return;
    }

    focusBlock(block, number);
  };

  if (blockTypeKey === 'solution' && !showSolutions) {
    return null;
  }

  if (block.type === 'cela_permet_de') {
    return (
      <div
        ref={blockRef}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleFocusKeyDown}
        tabIndex={0}
        role="group"
        aria-label="Cela permet de. Appuyez sur Entrée pour ouvrir le mode lecture."
        className="rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42668f]/35"
      >
        <CelaPermetDeBlock content={block.content} />
      </div>
    );
  }

  if (ALL_SEMANTIC.has(blockTypeKey)) {
    const label = ENV_LABELS[blockTypeKey] || blockTypeKey.toUpperCase();
    const styleEnv = ENV_STYLES[blockTypeKey] || ENV_STYLES['definition'];
    const contentStr = Array.isArray(block.content) ? block.content.join('\n') : block.content;
    const typeTone = ENV_COLORS[blockTypeKey] || ENV_COLORS.default;

    if (REVEALABLE.has(blockTypeKey)) {
      const hideRevealTitle = blockTypeKey === 'hint' || blockTypeKey === 'solution';
      const rawTitle = hideRevealTitle ? '' : (block.title || '').trim();
      const useStylishQuestion = STYLISH_QUESTION_TYPES.has(blockTypeKey) && rawTitle.length > 0;
      const titleForRender = useStylishQuestion
        ? rawTitle.replace(/\?\s*$/, '').replace(/\?\s*(\$\s*)$/, '$1')
        : rawTitle;
      const isMethod = blockTypeKey === 'method';
      const isCoreRevealBox =
        blockTypeKey === 'definition' ||
        blockTypeKey === 'theorem' ||
        blockTypeKey === 'proposition' ||
        blockTypeKey === 'property';

      const revealLeadMedia = flatReveal ? undefined : mediaByAnchor(block.media, 'lead', 'reveal');
      const revealContentMedia = flatReveal ? block.media : mediaByAnchor(block.media, 'content', 'reveal');

      const needsLeftAlign =
        ALWAYS_LEFT.has(blockTypeKey) || /\\begin\{(itemize|enumerate)\}|\\item\s/.test(contentStr);
      const smartContentClass = needsLeftAlign
        ? `${styleEnv.contentClass.replace('text-justify', 'text-left').replace('text-center', 'text-left')} text-left`
        : styleEnv.contentClass;

      const shouldEnlarge = ENLARGE_TYPES.has(blockTypeKey);
      const revealedContent = (
        <div
          className={`${smartContentClass}${isCoreRevealBox || isMethod ? ' core-reveal-content-balance' : ''}${shouldEnlarge ? ' revision-content-enlarged' : ''}`}
        >
          <QuestionFigureContent
            content={contentStr}
            media={block.media && mediaByAnchor(block.media, 'item')}
            surface="revision"
          />
        </div>
      );

      const revealHeader = (
        <div
          className={`revision-reveal-header relative z-10 w-full text-left${isMethod ? ' flex items-start justify-between gap-3.5 revision-method-header' : ''}${!flatReveal ? ' cursor-pointer select-none' : ''}`}
          {...(!flatReveal
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-expanded': isRevealed,
                'aria-controls': revealContentId,
                title: isRevealed
                  ? isMethod ? 'Cliquer pour replier la méthode' : 'Cliquer pour replier'
                  : isMethod ? 'Cliquer pour afficher la méthode' : 'Cliquer pour afficher',
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleReveal();
                  }
                },
              }
            : {})}
        >
          {block.title && !hideRevealTitle && (
            <h3 className="typo-display font-semibold text-[#0f172a] m-0 tracking-[-0.012em] text-left flex-1 min-w-0">
              {isMethod ? (
                <span className="revision-title-text revision-method-holo inline-block text-left">
                  <MathRenderer inline content={titleForRender} fontSize="inherit" enableLongPressHighlight enableLexicon={false} />
                  {useStylishQuestion && (
                    <span className="ml-1 revision-question-mark revision-question-mark-linked">
                      <QuestionGlyph />
                    </span>
                  )}
                </span>
              ) : (
                <span className="revision-title-text inline">
                  <MathRenderer inline content={titleForRender} fontSize="inherit" enableLongPressHighlight enableLexicon={false} />
                  {useStylishQuestion && (
                    <span className="ml-1 revision-question-mark revision-question-mark-linked">
                      <QuestionGlyph />
                    </span>
                  )}
                </span>
              )}
            </h3>
          )}
          {isMethod && !flatReveal && (
            <span className="revision-method-cue" aria-hidden="true">
              <FaIcon icon={faChevronDown} className="revision-method-cue-icon" size={14} />
            </span>
          )}
          {blockTypeKey !== 'problem' && !isMethod && (
            <RevealToggleButton isRevealed={isRevealed} controlsId={revealContentId} onToggle={toggleReveal} />
          )}
        </div>
      );

      const handleCardClick = (e: React.MouseEvent) => {
        if (flatReveal) return;
        const target = e.target as HTMLElement;

        if (
          target.closest('button') ||
          target.closest('a') ||
          target.closest('input') ||
          target.closest('.mathflow-lexicon-term') ||
          target.closest('.math-blank')
        ) {
          return;
        }

        if (typeof window !== 'undefined' && window.getSelection()?.toString()) {
          return;
        }

        if (!isRevealed) {
          toggleReveal();
          return;
        }

        if (
          target.closest('.revision-reveal-header') ||
          target.closest('.revision-reveal-badge-row') ||
          target.closest('.revision-badge')
        ) {
          toggleReveal();
        }
      };

      return (
        <div
          ref={blockRef}
          dir="ltr"
          lang="fr"
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleFocusKeyDown}
          onClick={handleCardClick}
          tabIndex={0}
          role="group"
          aria-label={`${label}${number ? ` ${number}` : ''}. ${!isRevealed ? 'Appuyez sur Entrée pour déplier.' : 'Appuyez sur Entrée pour ouvrir le mode lecture.'}`}
          title={
            !flatReveal
              ? !isRevealed
                ? isMethod ? 'Cliquer pour afficher la méthode' : 'Cliquer pour afficher le contenu'
                : 'Double-cliquez pour ouvrir ce bloc en mode lecture'
              : 'Double-cliquez pour ouvrir ce bloc en mode lecture'
          }
          className={`${styleEnv.containerClass} revision-reveal-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#256979]/30 focus-visible:ring-offset-2 revision-reveal-${blockTypeKey} relative w-full text-left box-block-math-boost${blockTypeKey === 'property' ? ' property-math-boost' : ''} ${!revealOpen ? 'revision-card-collapsed cursor-pointer' : 'revision-card-expanded cursor-default'}${flatReveal ? ' revision-card-flat' : ''}${isInView ? ' revision-in-view' : ''}`}
          style={{
            '--mathqst-color': typeTone,
            ...cardFillStyle(blockTypeKey),
            maxWidth: blockTypeKey === 'method' ? undefined : '100%',
          } as React.CSSProperties}
        >
          <RevisionBackground type={blockTypeKey} content={`${block.title || ''} ${contentStr}`} />
          {!isMethod && (
            <div className="revision-reveal-badge-row">
              <RevisionBadge typeKey={blockTypeKey} label={label} number={number} />
            </div>
          )}

          {!flatReveal &&
            (revealLeadMedia?.src ? (
              <MediaRenderer media={revealLeadMedia} surface="revision">
                {revealHeader}
              </MediaRenderer>
            ) : (
              revealHeader
            ))}

          <RevealPanel id={revealContentId} open={flatReveal || isRevealed} everOpened={flatReveal || hasOpenedReveal} flat={flatReveal}>
            {revealContentMedia?.src ? (
              <MediaRenderer media={revealContentMedia} surface="revision">
                {revealedContent}
              </MediaRenderer>
            ) : (
              revealedContent
            )}
          </RevealPanel>
        </div>
      );
    }

    if (blockTypeKey === 'intro') {
      return <IntroBlock content={contentStr} media={block.media} typeTone={typeTone} />;
    }

    const isPracticeBlock = PRACTICE_TYPES.has(blockTypeKey);
    const isApplication = blockTypeKey === 'application';
    const isExample = blockTypeKey === 'example';
    const isExploration = blockTypeKey === 'exploration';
    const isMethodBlock = blockTypeKey === 'method';
    const difficulty = isApplication ? getApplicationDifficulty(block.difficulty) : 0;
    const contentClassName = `${styleEnv.contentClass}${isMethodBlock ? ' core-reveal-content-balance revision-content-enlarged' : ''}${blockTypeKey === 'proof' ? ' proof-content' : ''}${isPracticeBlock ? ' revision-practice-content' : ''}${isApplication ? ' revision-application-content' : ''}${isExample ? ' revision-example-content revision-example-block-content' : ''}${isExploration ? ' revision-exploration-content' : ''}`;

    const itemMedia = mediaByAnchor(block.media, 'item');
    const renderSemanticContent = (media = itemMedia) => (
      <div className={contentClassName}>
        <QuestionFigureContent
          content={contentStr}
          media={media}
          surface="revision"
          variant={isApplication ? 'application' : 'default'}
        />
      </div>
    );

    const hasQuestionLead = isApplication && EXAMPLE_QUESTION_PATTERN.test(contentStr);
    const practiceClassName = isPracticeBlock
      ? `revision-practice-block revision-block-${blockTypeKey}${isApplication ? ' revision-application-block' : ' revision-example-block'}`
      : '';

    return (
      <div
        ref={blockRef}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleFocusKeyDown}
        tabIndex={0}
        role="group"
        aria-label={`${label}${number ? ` ${number}` : ''}. Appuyez sur Entrée pour ouvrir le mode lecture.`}
        title="Double-cliquez pour ouvrir ce bloc en mode lecture"
        className={`${styleEnv.containerClass} revision-course-block cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#256979]/30 focus-visible:ring-offset-2 revision-course-block-${blockTypeKey} relative ${practiceClassName}${isExploration ? ' revision-exploration-block' : ''}${hasQuestionLead ? ' revision-application-has-question' : ''}${isInView ? ' revision-in-view' : ''}`}
        style={{ '--mathqst-color': typeTone, ...cardFillStyle(blockTypeKey) } as React.CSSProperties}
      >
        {isApplication && <ApplicationDifficultyStars value={difficulty} />}
        <RevisionBackground type={blockTypeKey} content={`${block.title || ''} ${contentStr}`} />
        {isApplication ? (
          <ApplicationBlockContent
            block={block}
            typeKey={blockTypeKey}
            label={label}
            number={number}
            contentStr={contentStr}
            contentClassName={contentClassName}
          />
        ) : block.media?.src ? (
          <MediaRenderer media={withoutAnchor(block.media, 'item')} surface="revision">
            <BlockHeader type={blockTypeKey} label={label} title={block.title} number={number} />
            {renderSemanticContent()}
          </MediaRenderer>
        ) : (
          <>
            <BlockHeader type={blockTypeKey} label={label} title={block.title} number={number} />
            {renderSemanticContent()}
          </>
        )}
      </div>
    );
  }

  // TEXT BLOCK
  const defaultTextClass =
    'typo-ui font-normal text-[#1e293b] antialiased text-left text-block-body max-w-none tracking-normal';
  const contentStr = Array.isArray(block.content) ? block.content.join('\n') : block.content;
  const textOnly = contentStr.trim();
  const isCollapsibleText = blockTypeKey === 'text' && !!block.title?.trim();
  const textContent = (
    <MediaRenderer media={block.media} surface="revision">
      <div className={defaultTextClass}>
        <MathRenderer content={textOnly} fontSize="inherit" enableLongPressHighlight />
      </div>
    </MediaRenderer>
  );

  return (
    <div
      ref={blockRef}
      dir="ltr"
      lang="fr"
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleFocusKeyDown}
      tabIndex={0}
      role="group"
      aria-label="Bloc de lecture. Appuyez sur Entrée pour ouvrir le mode lecture."
      title="Double-cliquez pour ouvrir ce bloc en mode lecture"
      className={`revision-reading-block relative my-3.5 md:my-4 w-full cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#256979]/30 focus-visible:ring-offset-2${isCollapsibleText ? ` revision-text-disclosure ${isRevealed ? 'revision-card-expanded' : 'revision-card-collapsed'}` : ''}${isInView ? ' revision-in-view' : ''}`}
    >
      {isCollapsibleText ? (
        <>
          <div
            className="revision-text-question-row cursor-pointer select-none"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button') || target.closest('a') || target.closest('input')) return;
              toggleReveal();
            }}
          >
            <h4 className="revision-text-question typo-display">
              <MathRenderer inline content={block.title!} fontSize="inherit" enableLongPressHighlight enableLexicon={false} />
            </h4>
            <RevealToggleButton isRevealed={isRevealed} controlsId={revealContentId} onToggle={toggleReveal} />
          </div>
          <RevealPanel id={revealContentId} open={isRevealed} everOpened={hasOpenedReveal}>
            {textContent}
          </RevealPanel>
        </>
      ) : (
        <>
          {block.title && (
            <h4 className="typo-display font-medium text-[1.16rem] md:text-[1.26rem] text-[#0f172a] mb-2.5 tracking-[-0.01em]">
              <MathRenderer inline content={block.title} fontSize="inherit" enableLongPressHighlight enableLexicon={false} />
            </h4>
          )}
          {textContent}
        </>
      )}
    </div>
  );
};

export default React.memo(CourseBlock);
