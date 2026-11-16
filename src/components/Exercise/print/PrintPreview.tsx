import { useEffect, useRef, useState, type ReactNode } from 'react';
import { pageBoxMm, type PrintLayout } from '../../../services/printLayout';
import PrintSurface from './PrintSurface';

export default function PrintPreview({ children, layout }: { children: ReactNode; layout: PrintLayout }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.62);
  const [pages, setPages] = useState(1);
  const box = pageBoxMm(layout);

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;
    const measure = () => {
      const nextZoom = Math.min(1, Math.max(0.2, (viewport.clientWidth - 32) / page.offsetWidth));
      setZoom(nextZoom);
      const contentHeightPx = page.offsetWidth * (box.contentHeight / box.width);
      const documentHeight = page.querySelector<HTMLElement>('.print-document')?.scrollHeight || page.scrollHeight;
      setPages(Math.max(1, Math.ceil((documentHeight - 1) / Math.max(1, contentHeightPx))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(page);
    return () => observer.disconnect();
  }, [box.contentHeight, box.width, children]);

  const pageHeight = `${box.height}mm`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-200/70 p-4">
        <div className="mx-auto" style={{ width: `${box.width * zoom}mm`, height: `max(${box.height * zoom}mm, ${pages * box.height * zoom}mm)` }}>
          <div ref={pageRef} className="print-preview relative origin-top bg-white shadow-[0_12px_35px_rgba(15,23,42,.18)]" style={{ width: `${box.width}mm`, minHeight: pageHeight, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <PrintSurface layout={layout}>
              <div style={{ padding: `${layout.page.marginTop}mm ${layout.page.marginSide}mm ${layout.page.marginBottom}mm`, minHeight: pageHeight }}>
                {children}
              </div>
            </PrintSurface>
            {Array.from({ length: Math.max(0, pages - 1) }, (_, index) => (
              <div key={index} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-sky-500/55" style={{ top: `${(index + 1) * box.height}mm` }} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
        A4 · {layout.page.orientation} · {Math.round(zoom * 100)} % · ~{pages} page{pages > 1 ? 's' : ''} (estimation)
      </p>
    </div>
  );
}
