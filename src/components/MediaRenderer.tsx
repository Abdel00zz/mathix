
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MediaConfig, MediaImage, MediaPosition } from '../types';
import MathRenderer from './MathRenderer';
import { faExpand, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from './UI/FaIcon';
import BoxNoteZone from './Revision/annotation/BoxNoteZone';
import { useProfessorAccess } from '../hooks/useProfessorAccess';
import { useProfPersonalization } from '../hooks/useProfPersonalization';
import { useImagePlate } from '../hooks/useImagePlate';
import { useIsDesktop, useSupportsSideColumns } from '../hooks/useMediaQuery';
import { useIsTabletSurface } from '../hooks/useProfViewMode';
import { groupMediaByPosition, mediaImages } from '../utils/mediaGallery';
import { MEDIA_SIZING, knownAspectRatio, pickSizing } from '../utils/mediaSizing';
import SharedImageViewer from './ProfStudio/SharedImageViewer';
import type { SharedImage } from '../services/professorClassroomService';

function stableMediaKey(src: string): string {
  let hash = 2166136261;
  for (let i = 0; i < src.length; i++) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const toCssLength = (value: string | number): string =>
  typeof value === 'number' ? `${value}px` : value;

interface MediaRendererProps {
  media?: MediaConfig;
  children: React.ReactNode;
  position?: MediaPosition;
  /** La fiche de révision fond les blancs opaques de l'image dans sa zone média. */
  surface?: 'default' | 'revision';
  /**
   * `application` : figure d'un « Exercice d'application ».
   * `exercise` : figure d'un exercice (énoncé, question, sous-question).
   * Dans les deux cas, la taille est adaptée au placement — la figure ne doit
   * pas écraser l'énoncé, contrairement à une fiche de cours qui respire.
   */
  variant?: 'default' | 'application' | 'exercise';
  editorPreview?: boolean;
}

// --- OPTIMIZED IMAGE COMPONENT ---
interface OptimizedImageProps extends Partial<MediaConfig> {
  src: string;
  surface?: MediaRendererProps['surface'];
  /**
   * Mode « colonne latérale » : la figure occupe toute la hauteur que lui donne
   * son parent au lieu de l'imposer. L'image se contente de la place restante
   * une fois la légende posée, en conservant ses proportions.
   */
  fit?: boolean;
  editorPreview?: boolean;
  gallery?: MediaImage[];
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt = 'Illustration',
  caption,
  captionStyle,
  lazy = true,
  zoomable = true,
  className = '',
  style,
  height,
  naturalWidth,
  naturalHeight,
  surface = 'default',
  fit = false,
  editorPreview = false,
  gallery,
}) => {
  const professorAccess = useProfessorAccess();
  const isDesktop = useIsDesktop();
  const isTabletSurface = useIsTabletSurface();
  const { canvas, revision: revisionPrefs } = useProfPersonalization();
  // Fond nécessaire derrière la figure : détecté une fois, mémorisé par source,
  // donc disponible sans attente à l'ouverture en grand.
  const plate = useImagePlate(src);
  const canAnnotate = professorAccess && isTabletSurface && canvas.enabled && !editorPreview;
  const [selectedSrc, setSelectedSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [zoomId, setZoomId] = useState<number>(0);
  const [gifSrc, setGifSrc] = useState(src);
  const [isVisible, setIsVisible] = useState(false);
  // Dimensions connues à l'import : la place est réservée dès le premier rendu,
  // sans attendre le chargement du binaire (plus de saut de mise en page).
  const declaredRatio = knownAspectRatio(naturalWidth, naturalHeight);
  const [aspectRatio, setAspectRatio] = useState<number | null>(declaredRatio);
  const [previousSrc, setPreviousSrc] = useState(src);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect if the source is a GIF
  const isGif = src.toLowerCase().endsWith('.gif') || src.includes('.gif?');
  const isDataUrl = src.startsWith('data:');
  // Papier sombre : le fondu « multiply » du cours y effacerait une figure à
  // traits sombres — on pose à la place une plaque claire.
  const darkPaper = surface === 'revision' && revisionPrefs.paperTheme === 'dark';

  // Default styles: Border is kept for the image itself, but shadow is lighter
  const { border = true, shadow = true, rounded = true } = style || {};
  const captionAlign = captionStyle?.align || 'left';
  const captionSize = captionStyle?.size || 'xs';
  const captionSizeClass = captionSize === 'md'
    ? 'text-[11px] md:text-xs'
    : captionSize === 'sm'
      ? 'text-[10px] md:text-[11px]'
      : 'text-[9px] md:text-[10px]';
  const captionAlignClass = captionAlign === 'center'
    ? 'text-center'
    : captionAlign === 'right'
      ? 'text-right'
      : 'text-left';

  if (previousSrc !== src) {
    setPreviousSrc(src);
    setIsLoading(true);
    setHasError(false);
    setGifSrc(src);
    setAspectRatio(declaredRatio);
    setSelectedSrc(src);
    setIsZoomed(false);
  }

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      const timer = setTimeout(() => setIsLoading(false), 0);
      return () => clearTimeout(timer);
    }
  }, [src]);

  // Track visibility with IntersectionObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Only loop GIF when visible - restart periodically while in viewport
  useEffect(() => {
    if (!isGif || isDataUrl || !isVisible) return;

    // Restart GIF when becoming visible
    setTimeout(() => setGifSrc(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`), 0);
  }, [isGif, isDataUrl, isVisible, src]);

  // Restart GIF when tab becomes visible (only if element is also in viewport)
  useEffect(() => {
    if (!isGif || isDataUrl) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isVisible) {
        setGifSrc(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isGif, isDataUrl, src, isVisible]);

  const toggleZoom = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoomable && !hasError) {
      setIsZoomed(prev => {
        const nextState = !prev;
        if (nextState) setZoomId(Date.now());
        return nextState;
      });
    }
  }, [zoomable, hasError]);

  useEffect(() => {
    if (!isZoomed) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsZoomed(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isZoomed]);

  // When modal closes, restart thumbnail GIF if visible
  useEffect(() => {
    if (!isZoomed && isGif && !isDataUrl && isVisible) {
      setTimeout(() => setGifSrc(`${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`), 0);
    }
  }, [isZoomed, isGif, isDataUrl, src, isVisible]);

  const modalSrc = isDataUrl ? src : `${src}${src.includes('?') ? '&' : '?'}replay=${zoomId}`;
  const thumbnailSrc = isGif && !isDataUrl ? gifSrc : src;

  const isPortrait = aspectRatio !== null && aspectRatio < 0.82;
  const isWide = aspectRatio !== null && aspectRatio > 1.8;

  const containerClasses = `
    media-figure relative group block
    ${fit ? 'md:h-full md:flex md:flex-col md:min-h-0' : ''}
    ${className}
  `;

  // Le cadre est volontairement distinct du bloc de contenu. Son fond neutre
  // évite que les schémas transparents ou très clairs se fondent dans la carte.
  const frameClasses = `
    media-figure-frame relative overflow-hidden p-1.5 md:p-2
    ${surface === 'revision' ? 'revision-media-canvas isolate' : 'bg-slate-50/90'}
    ${fit ? 'md:flex-1 md:min-h-0' : ''}
    ${rounded ? 'rounded-xl' : ''}
    ${border ? 'border border-slate-200/90' : ''}
    ${shadow ? 'shadow-[0_8px_22px_-16px_rgba(15,23,42,0.55)]' : ''}
  `;

  // L'image reste toujours contenue dans son cadre : ratio naturel chargé à
  // l'exécution, sans recadrage. Les formats portrait et très larges reçoivent
  // une limite de hauteur adaptée pour ne jamais déséquilibrer le texte.
  const imageClasses = `
    media-figure-image block w-full max-w-full object-contain transition-opacity duration-300
    ${fit ? 'h-full' : 'h-auto'}
    ${isPortrait ? 'max-h-[min(66vh,42rem)]' : ''}
    ${isWide ? 'max-h-[min(48vh,28rem)]' : ''}
    ${surface === 'revision' && !darkPaper ? 'mix-blend-multiply' : ''}
    ${plate === 'light' && (surface !== 'revision' || darkPaper) ? 'bg-paper' : ''}
    ${isLoading ? 'opacity-0' : 'opacity-100'}
    ${zoomable && !hasError ? 'cursor-zoom-in' : ''}
  `;
  const frameStyle: React.CSSProperties | undefined = !fit && height == null && aspectRatio
    ? { aspectRatio }
    : undefined;
  const mediaSurfaceStyle: React.CSSProperties | undefined = frameStyle;

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setAspectRatio(naturalWidth / naturalHeight);
    }
    setIsLoading(false);
  };

  return (
    <>
      <figure ref={containerRef} className={containerClasses} onClick={toggleZoom}>
        <div className={frameClasses} style={mediaSurfaceStyle}>
            {isLoading && (
            <div className="absolute inset-0 bg-paper/50 animate-pulse flex items-center justify-center z-10 min-h-[100px]">
                <div className="w-4 h-4 border-2 border-border border-t-emerald-600 rounded-full animate-spin" />
            </div>
            )}

            <img
            ref={imgRef}
            src={thumbnailSrc}
            alt={alt}
            loading={lazy ? "lazy" : "eager"}
            decoding="async"
            fetchPriority={lazy ? "low" : "high"}
            referrerPolicy="no-referrer"
            onLoad={handleImageLoad}
            onError={() => { setIsLoading(false); setHasError(true); }}
            className={imageClasses}
            style={height != null ? { height } : undefined}
            />

            {zoomable && !isLoading && !hasError && (
            <div className="hidden md:flex absolute top-2 right-2 bg-slate-800/60 text-paper p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <FaIcon icon={faExpand} size={11} aria-hidden="true" />
            </div>
            )}
        </div>

        {caption && (
          <figcaption className={`mt-1.5 px-0.5 ${fit ? 'md:flex-shrink-0' : ''} ${captionAlignClass}`}>
            <span className={`block ${captionSizeClass} text-slate-500 font-medium leading-[1.45] tracking-[0.01em] ${captionStyle?.italic ? 'italic' : ''}`}>
              <MathRenderer inline content={caption} fontSize="inherit" enableLexicon={false} className="!text-current" />
            </span>
          </figcaption>
        )}
      </figure>

      {!fit && professorAccess && !editorPreview && (
        <div className={`${isDesktop ? 'hidden' : ''} print:hidden`} onClick={(event) => event.stopPropagation()}>
          <BoxNoteZone noteKey={`exercise-media:${stableMediaKey(src)}`} />
        </div>
      )}

      {/* Fullscreen Modal */}
      {isZoomed && canAnnotate && createPortal(
        <SharedImageViewer
          image={contentViewerImage((gallery || [{ src, alt, caption }]).find(entry => entry.src === selectedSrc) || { src, alt, caption })}
          images={(gallery || [{ src, alt, caption }]).map(contentViewerImage)}
          onSelectImage={image => setSelectedSrc(image.dataUri)}
          onClose={() => { setIsZoomed(false); setSelectedSrc(src); }}
          annotate
        />, document.body
      )}
      {isZoomed && !canAnnotate && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-800/95 backdrop-blur-sm animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative w-full h-full p-4 flex flex-col items-center justify-center">
            <img
              key={zoomId}
              src={modalSrc}
              alt={alt}
              decoding="async"
              /* Figure sans fond : sans plaque claire, elle serait invisible
                 sur le fond sombre de la visionneuse. */
              className={`max-w-[95vw] max-h-[85vh] object-contain select-none rounded-sm ${plate === 'light' ? 'bg-paper p-1.5' : 'shadow-2xl'}`}
              onClick={(e) => e.stopPropagation()}
            />
            {caption && (
              <div className="mt-4 px-4 py-2 text-paper/80 text-sm font-light text-center max-w-2xl">
                <MathRenderer inline content={caption} className="!text-paper" fontSize="inherit" />
              </div>
            )}
            {/* Bouton Fermer Amélioré : Boîte Blanche pour Contraste */}
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              aria-label="Fermer l'image"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <FaIcon icon={faXmark} size={17} aria-hidden="true" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const contentViewerImage = (media: MediaImage): SharedImage => ({
  id: `content-${stableMediaKey(media.src)}`,
  dataUri: media.src,
  studentName: media.alt || 'Image du contenu',
  studentAccountId: '',
  classId: '',
  caption: media.caption || '',
  createdAt: 0,
});

/** Plusieurs figures entourent un unique bloc de texte, sans imbriquer les colonnes. */
const MediaGallery: React.FC<MediaRendererProps & { images: MediaImage[] }> = ({ images, children, position, surface, variant = 'default', editorPreview }) => {
  // `application` et `exercise` partagent la mise en page compacte : colonnes
  // latérales plus étroites, habillage plus court, pour préserver l'énoncé.
  const isApplication = variant !== 'default';
  const groups = groupMediaByPosition(images, position);
  const left = [...groups.left, ...groups.inline];
  const right = [...groups.right, ...groups['inline-right']];
  const figure = (item: MediaImage, index: number, stacked = false) => (
    <div key={`${item.src}:${index}`} className="min-w-0 max-w-full" style={{ width: item.width ?? (stacked ? MEDIA_SIZING.gallery.rowItemWidth : '100%'), maxWidth: '100%' }}>
      <OptimizedImage {...item} surface={surface} editorPreview={editorPreview} gallery={images} />
    </div>
  );
  const row = (items: MediaImage[]) => items.length > 0 && <div className="flex flex-wrap justify-center gap-4">{items.map((item, index) => figure(item, index, true))}</div>;
  const sideColumn = `${pickSizing(MEDIA_SIZING.gallery.sideColumn, isApplication)} `;
  const columns = `${left.length ? sideColumn : ''}minmax(0, 1fr)${right.length ? ` ${sideColumn.trim()}` : ''}`;
  return <div className="media-gallery flex w-full flex-col gap-4">
    {row(groups.top)}
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 min-[900px]:grid-cols-[var(--media-gallery-columns)]" style={{ '--media-gallery-columns': columns } as React.CSSProperties}>
      {left.length > 0 && <div className="flex min-w-0 flex-col gap-3">{left.map((item, index) => figure(item, index))}</div>}
      <div className="min-w-0 flow-root">
        {(['float-left', 'float-right'] as const).map(side => groups[side].length > 0 && <div key={side} className={`mb-3 flex flex-col gap-3 ${pickSizing(MEDIA_SIZING.gallery.floatMaxWidthClass, isApplication)} ${side === 'float-left' ? 'float-left mr-4' : 'float-right ml-4'}`} style={{ width: groups[side][0].width ?? pickSizing(MEDIA_SIZING.gallery.floatWidth, isApplication) }}>{groups[side].map((item, index) => figure(item, index))}</div>)}
        {children}
      </div>
      {right.length > 0 && <div className="flex min-w-0 flex-col gap-3">{right.map((item, index) => figure(item, index))}</div>}
    </div>
    {row(groups.bottom)}
  </div>;
};

// --- UNIFIED MEDIA RENDERER ---
const MediaRenderer: React.FC<MediaRendererProps> = ({
  media,
  children,
  position: positionOverride,
  surface = 'default',
  variant = 'default',
  editorPreview = false,
}) => {
  const supportsSideColumns = useSupportsSideColumns();

  if (!media?.src) return <>{children}</>;

  // `application` et `exercise` sont compacts : la figure accompagne le texte
  // sans le pousser hors de sa colonne.
  const isApplication = variant !== 'default';
  const images = mediaImages(media);
  if (images.length > 1) return <MediaGallery images={images} media={media} position={positionOverride} surface={surface} variant={variant} editorPreview={editorPreview}>{children}</MediaGallery>;

  const { width: configWidth, style: styleConfig, ...imageProps } = media;
  const restMedia = { ...imageProps, editorPreview };
  const position = positionOverride || media.position || 'top';

  // --- COLONNE LATÉRALE (left / right) ---
  /*
   * `right` et `left` décrivent une colonne, pas un habillage : le texte ne
   * s'enroule pas autour de l'image, il lui fait face. La hauteur de la colonne
   * média est donc dictée par le texte, jamais l'inverse.
   *
   * Le mécanisme est en CSS pur, et c'est délibéré. Mesurer le texte en JS pour
   * en déduire une largeur d'image créerait une boucle : changer la largeur
   * change le retour à la ligne, donc la hauteur du texte, donc la largeur
   * voulue. Ici le contenu média est en `absolute inset-0` : il ne participe
   * pas au calcul de la hauteur de ligne de la grille, il la subit. Aucune
   * boucle possible, et la mise en page suit le texte à chaque reflux, à chaque
   * changement de largeur ou de taille de police.
   *
   * `float-left` / `float-right` conservent l'habillage magazine.
   */
  if (position === 'left' || position === 'right') {
    const isLeft = position === 'left';
    const mediaCol = configWidth != null
      ? `minmax(0, ${toCssLength(configWidth)})`
      : pickSizing(MEDIA_SIZING.sideColumn, isApplication);
    const textCol = 'minmax(0, 1fr)';

    // Mode tablette/téléphone : la « colonne » devient un empilement — l'image
    // reprend son flux au-dessus (left) ou en dessous (right) du texte.
    if (!supportsSideColumns) {
      return (
        <div className={`flex w-full flex-col gap-4 ${media.className || ''}`}>
          {isLeft && <OptimizedImage {...restMedia} src={media.src} alt={media.alt || ''} style={styleConfig} surface={surface} />}
          <div className="min-w-0">{children}</div>
          {!isLeft && <OptimizedImage {...restMedia} src={media.src} alt={media.alt || ''} style={styleConfig} surface={surface} />}
        </div>
      );
    }

    const mediaCell = (
      <div className="relative">
        {/* Hors flux vertical : la colonne épouse la hauteur du texte. */}
        <div className="absolute inset-0 flex flex-col min-h-0">
          <OptimizedImage {...restMedia} src={media.src} alt={media.alt || ''} style={styleConfig} surface={surface} fit />
        </div>
      </div>
    );

    return (
      <div
        className={`
          grid w-full grid-cols-[var(--media-cols)] gap-7 items-stretch ${pickSizing(MEDIA_SIZING.sideColumnMinHeight, isApplication)}
          ${media.className || ''}
        `}
        style={{ '--media-cols': isLeft ? `${mediaCol} ${textCol}` : `${textCol} ${mediaCol}` } as React.CSSProperties}
      >
        {isLeft && mediaCell}
        <div className="min-w-0">{children}</div>
        {!isLeft && mediaCell}
      </div>
    );
  }

  const isFloat = ['float-left', 'float-right'].includes(position);

  if (isFloat) {
    const isLeft = position.includes('left');
    // Magazine-style float: image sits elegantly, text wraps then fills full width below
    // Responsive width: 40% on mobile, 30% on desktop, unless configWidth is provided
    const widthStyle = configWidth ? { width: configWidth } : {};
    const hasPercentWidth = typeof configWidth === 'string' && configWidth.trim().endsWith('%');

    return (
      <div className="flow-root w-full">
        {/* Magazine-style floating figure — text wraps around, then fills full width below. Works on all screens. */}
        <div 
          className={`
            relative z-10 rounded-xl
            ${isLeft ? 'float-left mr-5 md:mr-7' : 'float-right ml-5 md:ml-7'}
            mb-4 md:mb-5 mt-1 md:mt-1.5
            ${pickSizing(MEDIA_SIZING.floatClass, isApplication)}
            ${media.className || ''}
          `}
          style={{
            ...widthStyle,
            minWidth: configWidth && !hasPercentWidth ? '140px' : undefined,
            shapeOutside: 'margin-box',
          }}
        >
          <OptimizedImage {...restMedia} src={media.src} alt={media.alt || ''} style={styleConfig} surface={surface} />
        </div>

        {/* Children rendered directly in the flow — NO wrapper div, so text wraps naturally around the float */}
        {children}
      </div>
    );
  }

  // --- INLINE POSITION ---
  if (position === 'inline' || position === 'inline-right') {
    const hasCustomWidth = configWidth != null;
    const isInlineRight = position === 'inline-right';
    return (
      <div className={`flex flex-wrap items-start gap-6 w-full ${isInlineRight ? 'flex-row-reverse' : ''}`}>
        <div className="flex-shrink-0" style={{ width: configWidth || 'auto', maxWidth: hasCustomWidth ? 'none' : pickSizing(MEDIA_SIZING.inlineMaxWidth, isApplication) }}>
          <OptimizedImage {...restMedia} src={media.src} alt={media.alt || ''} style={styleConfig} surface={surface} />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  // --- STACKED POSITIONS ---
  const isTop = position === 'top';
  const hasCustomWidth = configWidth != null;
  // Dans un exercice d'application, la figure posée au-dessus de l'énoncé
  // reste une vignette : c'est le texte de l'exercice qui porte le sens. En
  // bas de correction, elle reprend la taille pleine d'une figure de cours.
  const stackedSizeClass = hasCustomWidth
    ? ''
    : (isApplication && isTop ? MEDIA_SIZING.stackedClass.compactTop : MEDIA_SIZING.stackedClass.regular);
  const stackedSizeStyle: React.CSSProperties | undefined = hasCustomWidth
    ? { width: configWidth, maxWidth: '100%' }
    : undefined;

  const imageBlock = (
    <div className="w-full flex justify-center py-2">
      <div className={stackedSizeClass} style={stackedSizeStyle}>
        <OptimizedImage {...restMedia} src={media.src} alt={media.alt || ''} style={styleConfig} surface={surface} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 w-full">
      {isTop && imageBlock}
      <div className="w-full min-w-0">{children}</div>
      {!isTop && imageBlock}
    </div>
  );
};

export default React.memo(MediaRenderer);
