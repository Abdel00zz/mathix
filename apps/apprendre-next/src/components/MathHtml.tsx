'use client';

import React, { useMemo } from 'react';
import { renderMathInHtml } from '@/lib/math/mathEngine';

interface MathHtmlProps {
  text?: string | null;
  rawHtml?: string;
  enableLexicon?: boolean;
  basePath?: string;
  className?: string;
  as?: 'span' | 'div' | 'p';
}

export function MathHtml({
  text,
  rawHtml,
  enableLexicon = false,
  basePath = '',
  className,
  as = 'span',
}: MathHtmlProps) {
  const html = useMemo(() => {
    if (rawHtml !== undefined) return rawHtml;
    return renderMathInHtml(String(text ?? ''), { enableLexicon, basePath });
  }, [text, rawHtml, enableLexicon, basePath]);

  const Tag = as;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
