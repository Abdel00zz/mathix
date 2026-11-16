

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { useI18n } from '../../i18n/I18nContext';

interface HeaderProps {
  currentIndex: number;
  totalExercises: number;
  onPrev: () => void;
  onNext: () => void;
  onJumpTo: (index: number) => void;
}

const Header: React.FC<HeaderProps> = ({ currentIndex, totalExercises, onPrev, onNext, onJumpTo }) => {
  const { dir, t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setTimeout(() => setInputValue(String(currentIndex + 1)), 0);
    }
  }, [currentIndex, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleJump = useCallback(() => {
    const n = parseInt(inputValue, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalExercises) {
      onJumpTo(n - 1);
    } else {
      setInputValue(String(currentIndex + 1));
    }
    setIsEditing(false);
  }, [inputValue, totalExercises, currentIndex, onJumpTo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleJump();
    else if (e.key === 'Escape') {
      setInputValue(String(currentIndex + 1));
      setIsEditing(false);
    }
  }, [handleJump, currentIndex]);

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalExercises - 1;

  return (
    <header className="sticky top-3 md:top-4 z-40 w-full flex justify-center pointer-events-none mb-5 md:mb-7 px-4 animate-in fade-in slide-in-from-top-3 duration-500">
        <div className="
            pointer-events-auto
            flex items-center gap-1.5
            bg-white/95 backdrop-blur-md
            border-[3px] border-white
            ring-1 ring-slate-200/50
            rounded-full
            px-2 py-1
            shadow-[0_12px_36px_-8px_rgba(30,37,72,0.12)]
            transition-all duration-300 hover:shadow-[0_16px_40px_-6px_rgba(30,37,72,0.15)]
        ">
            {/* Prev */}
            <button
                type="button"
                onClick={onPrev}
                disabled={isFirst}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-[#1E2548] hover:bg-slate-50 border border-transparent hover:border-slate-200/40 rounded-full disabled:opacity-20 transition-all duration-300 active:scale-90 touch-manipulation cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E2548]"
                aria-label={t('common.previous')}
            >
                <FaIcon icon={dir === 'rtl' ? faChevronRight : faChevronLeft} size={15} aria-hidden="true" />
            </button>
 
            {/* Numéro exercice */}
            {isEditing ? (
              <input
                ref={inputRef}
                type="number"
                min={1}
                max={totalExercises}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={handleJump}
                onKeyDown={handleKeyDown}
                aria-label={t('common.navigation')}
                className="w-14 h-9 text-center bg-transparent text-[#1E2548] typo-ui font-black text-sm tabular-nums focus:outline-none focus:border-b-2 focus:border-[#1E2548] appearance-none transition-all"
                style={{ MozAppearance: 'textfield' }}
              />
            ) : (
              <button
                type="button"
                className="flex items-center gap-1.5 select-none px-2.5 h-10 cursor-pointer transition-all duration-300 group hover:opacity-80 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E2548]"
                onClick={() => setIsEditing(true)}
                title={t('common.navigation')}
              >
                <span className="hidden sm:inline typo-ui font-black text-[0.66rem] uppercase tracking-[0.16em] text-slate-450 transition-colors group-hover:text-[#1E2548]">
                  {t('common.exercise')}
                </span>
                <span className="sm:hidden typo-ui font-black text-[0.66rem] uppercase tracking-[0.16em] text-slate-450 transition-colors group-hover:text-[#1E2548]">
                  {t('common.exercise').slice(0, 2)}
                </span>
                <div className="flex items-baseline gap-0.5">
                  <span className="typo-ui font-black text-base text-[#1E2548] leading-none tabular-nums">
                      {currentIndex + 1}
                  </span>
                  <span className="text-slate-300 text-xs font-semibold leading-none mx-0.5 select-none">/</span>
                  <span className="typo-ui text-xs text-slate-400 font-bold leading-none tabular-nums">
                      {totalExercises}
                  </span>
                </div>
              </button>
            )}
 
            {/* Next */}
            <button
                type="button"
                onClick={onNext}
                disabled={isLast}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-[#1E2548] hover:bg-slate-50 border border-transparent hover:border-slate-200/40 rounded-full disabled:opacity-20 transition-all duration-300 active:scale-90 touch-manipulation cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E2548]"
                aria-label={t('common.next')}
            >
                <FaIcon icon={dir === 'rtl' ? faChevronLeft : faChevronRight} size={15} aria-hidden="true" />
            </button>
        </div>
    </header>
  );
};

export default memo(Header);
