import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ui } from './designSystem';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  disabled?: boolean;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, disabled = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const lastTouchPointerRef = useRef(false);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearDismissTimer();
    setIsVisible(true);
  }, [clearDismissTimer]);

  const hide = useCallback(() => {
    clearDismissTimer();
    setIsVisible(false);
  }, [clearDismissTimer]);

  const scheduleTouchDismiss = useCallback(() => {
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => setIsVisible(false), 2600);
  }, [clearDismissTimer]);

  useEffect(() => {
    if (!isVisible) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible]);

  useEffect(() => clearDismissTimer, [clearDismissTimer]);

  if (disabled) return children;

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex w-full"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      onPointerDownCapture={(event) => {
        lastTouchPointerRef.current = event.pointerType !== 'mouse';
        if (lastTouchPointerRef.current) {
          show();
          scheduleTouchDismiss();
        }
      }}
      onClick={() => {
        if (lastTouchPointerRef.current) {
          lastTouchPointerRef.current = false;
          return;
        }
        setIsVisible((visible) => !visible);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={ui.tooltip.bubble}
        >
          {content}
          <span className={ui.tooltip.arrow} />
        </div>
      )}
    </div>
  );
};

export default Tooltip;
