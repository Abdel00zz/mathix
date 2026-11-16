import { useEffect, useState } from 'react';

export const useActiveSection = (ids: string[], ready: boolean) => {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (!ready || ids.length === 0) return;

    let animationFrame = 0;

    const updateActiveSection = () => {
      const offset = 150;
      let nextActiveId = ids[0];

      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= offset) nextActiveId = id;
        else break;
      }

      setActiveId(current => current === nextActiveId ? current : nextActiveId);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleUpdate);
    ids.forEach(id => {
      const element = document.getElementById(id);
      if (element) resizeObserver?.observe(element);
    });

    void document.fonts?.ready.then(scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [ids, ready]);

  return activeId;
};
