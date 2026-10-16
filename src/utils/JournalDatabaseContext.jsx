import { createContext, useContext } from 'react';
import { db } from '../db';

export const JournalDatabaseContext = createContext(null);
export function useJournalDatabase() { return useContext(JournalDatabaseContext) || db; }
