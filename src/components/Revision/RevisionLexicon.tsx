/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { RevisionLexiconEntry } from '../../types';
import { getLexiconSearchKeys, normalizeLexiconText } from '../../utils/lexiconUtils';

type RevisionLexiconContextValue = {
  entries: RevisionLexiconEntry[];
  findEntry: (text: string) => RevisionLexiconEntry | undefined;
};

const EMPTY_CONTEXT: RevisionLexiconContextValue = {
  entries: [],
  findEntry: () => undefined,
};

const RevisionLexiconContext = createContext<RevisionLexiconContextValue>(EMPTY_CONTEXT);

export const RevisionLexiconProvider: React.FC<{
  entries?: RevisionLexiconEntry[];
  children: React.ReactNode;
}> = ({ entries = [], children }) => {
  const indexedEntries = useMemo(
    () => entries.map((entry) => ({ entry, keys: getLexiconSearchKeys(entry) })),
    [entries]
  );

  const findEntry = useCallback((text: string) => {
    const normalized = normalizeLexiconText(text);
    if (!normalized) return undefined;

    return indexedEntries.find(({ keys }) => keys.includes(normalized))?.entry;
  }, [indexedEntries]);

  const value = useMemo<RevisionLexiconContextValue>(() => ({
    entries,
    findEntry,
  }), [entries, findEntry]);

  return (
    <RevisionLexiconContext.Provider value={value}>
      {children}
    </RevisionLexiconContext.Provider>
  );
};

export const useRevisionLexicon = () => useContext(RevisionLexiconContext);
