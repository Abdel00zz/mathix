import type { PropsWithChildren } from 'react';
import { printLayoutVars, type PrintLayout } from '../../../services/printLayout';

export default function PrintSurface({ children, className = '', layout }: PropsWithChildren<{ className?: string; layout: PrintLayout }>) {
  return (
    <div
      className={`print-surface ${className}`}
      data-columns={layout.page.columns}
      data-font={layout.type.fontFamily}
      data-paper={layout.color.paper}
      style={printLayoutVars(layout)}
    >
      {children}
    </div>
  );
}
