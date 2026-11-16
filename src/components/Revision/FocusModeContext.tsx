/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';
import { RevisionBlock } from '../../types';

interface FocusedBlockInfo {
  block: RevisionBlock;
  number?: number;
}

interface FocusModeContextType {
  focusedBlock: FocusedBlockInfo | null;
  focusBlock: (block: RevisionBlock, number?: number) => void;
  clearFocus: () => void;
}

const FocusModeContext = createContext<FocusModeContextType | undefined>(undefined);

export const FocusModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [focusedBlock, setFocusedBlock] = useState<FocusedBlockInfo | null>(null);

  const focusBlock = (block: RevisionBlock, number?: number) => {
    setFocusedBlock({ block, number });
  };

  const clearFocus = () => {
    setFocusedBlock(null);
  };

  return (
    <FocusModeContext.Provider value={{ focusedBlock, focusBlock, clearFocus }}>
      {children}
    </FocusModeContext.Provider>
  );
};

export const useFocusMode = () => {
  const context = useContext(FocusModeContext);
  if (!context) {
    throw new Error('useFocusMode must be used within a FocusModeProvider');
  }
  return context;
};
