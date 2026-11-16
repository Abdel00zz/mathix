'use client';

import { useLayoutEffect } from 'react';

export function RouteViewSync({ view }: { view: 'learn' | 'lib' | 'les' | 'quiz' | 'exo' }) {
  useLayoutEffect(() => {
    document.body.dataset.v = view;
  }, [view]);

  return null;
}
