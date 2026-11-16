import { katexService } from './katexService';

type PrintOptions = {
  selector?: string;
  timeoutMs?: number;
  pageCss?: string;
  /** Largeur utile réelle (page moins les marges `@page`), en mm. */
  contentWidthMm?: number;
};

const waitFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const waitForImages = async (root: Element, timeoutMs: number) => {
  const images = Array.from(root.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    })),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
};

const waitForMath = async (root: Element) => {
  const mathjax = (window as any).MathJax;
  if (mathjax?.typesetPromise) {
    try {
      await mathjax.typesetPromise([root]);
    } catch {
      // Printing should still work if one expression fails to typeset.
    }
  }

  // KaTeX : attendre que la bibliothèque soit chargée, puis que toutes les
  // instances `MathRenderer` aient composé leurs formules. Un nœud `.math-*`
  // sans descendant `.katex` est encore en attente de composition.
  await Promise.race([
    katexService.waitFor(),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);
  await new Promise<void>((resolve) => {
    const deadline = Date.now() + 3000;
    const tick = () => {
      const pending = Array.from(root.querySelectorAll('.math-display-node, .math-inline-node'))
        .some((node) => !node.querySelector('.katex'));
      if (!pending || Date.now() > deadline) resolve();
      else setTimeout(tick, 50);
    };
    tick();
  });
};

const waitForAfterPrint = () => new Promise<void>((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener('afterprint', finish);
    window.clearTimeout(fallback);
    resolve();
  };
  const fallback = window.setTimeout(finish, 15_000);
  window.addEventListener('afterprint', finish, { once: true });
});

export const printPrepared = async ({ selector = '.print-only', timeoutMs = 2500, pageCss, contentWidthMm }: PrintOptions = {}) => {
  const printRoot = document.querySelector(selector);

  document.documentElement.classList.add('is-print-preparing');

  if (!(printRoot instanceof HTMLElement)) {
    document.documentElement.classList.remove('is-print-preparing');
    throw new Error(`Document imprimable introuvable (${selector}).`);
  }

  if (printRoot instanceof HTMLElement) {
    const previous = {
      display: printRoot.style.display,
      position: printRoot.style.position,
      left: printRoot.style.left,
      top: printRoot.style.top,
      width: printRoot.style.width,
      visibility: printRoot.style.visibility,
      pointerEvents: printRoot.style.pointerEvents,
    };

    printRoot.style.display = 'block';
    printRoot.style.position = 'fixed';
    printRoot.style.left = '-10000px';
    printRoot.style.top = '0';
    // La largeur de mesure doit suivre le rendu final : mesurer un document
    // paysage à 210 mm ferait recomposer MathJax/KaTeX à une largeur qui n'est
    // pas celle du rendu. `contentWidthMm` retire en plus les marges `@page`,
    // sans quoi le texte est mesuré ~28 mm plus large qu'il ne sera imprimé —
    // écart qui se voit surtout sur une mise en page à deux colonnes.
    const landscape = pageCss ? /size:\s*A4\s+landscape/i.test(pageCss) : false;
    printRoot.style.width = contentWidthMm && contentWidthMm > 0
      ? `${contentWidthMm}mm`
      : landscape ? '297mm' : '210mm';
    printRoot.style.visibility = 'hidden';
    printRoot.style.pointerEvents = 'none';

    try {
      await document.fonts?.ready;
      await waitForImages(printRoot, timeoutMs);
      await waitForMath(printRoot);
      await waitFrame();
      await waitFrame();
    } finally {
      printRoot.style.display = previous.display;
      printRoot.style.position = previous.position;
      printRoot.style.left = previous.left;
      printRoot.style.top = previous.top;
      printRoot.style.width = previous.width;
      printRoot.style.visibility = previous.visibility;
      printRoot.style.pointerEvents = previous.pointerEvents;
    }
  }

  // Détache le document imprimable du reste de l'app et le remonte en enfant
  // direct de <body>. Le CSS `@media print` masque alors #root et n'imprime que
  // ce document (sinon toute l'interface web partait au papier).
  let originalParent: Node | null = null;
  let originalNext: Node | null = null;
  if (printRoot instanceof HTMLElement) {
    originalParent = printRoot.parentNode;
    originalNext = printRoot.nextSibling;
    document.body.appendChild(printRoot);
  }

  let pageStyle: HTMLStyleElement | null = null;
  try {
    if (pageCss) {
      pageStyle = document.createElement('style');
      pageStyle.dataset.printPage = '';
      pageStyle.textContent = pageCss;
      document.head.appendChild(pageStyle);
    }
    const afterPrint = waitForAfterPrint();
    window.print();
    await afterPrint;
  } finally {
    pageStyle?.remove();
    if (printRoot instanceof HTMLElement && originalParent) {
      if (originalNext) originalParent.insertBefore(printRoot, originalNext);
      else originalParent.appendChild(printRoot);
    }
    document.documentElement.classList.remove('is-print-preparing');
  }
};
