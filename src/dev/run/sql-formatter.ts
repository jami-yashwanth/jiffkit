import { format, type SqlLanguage } from 'sql-formatter';
import type { Runner } from '../form';

export const run: Runner = ({ text, dialect, case: keywordCase }) => {
  const s = String(text);
  if (!s.trim()) return {};
  try {
    return { out: { result: format(s, { language: String(dialect) as SqlLanguage, keywordCase: keywordCase as 'upper' | 'lower' | 'preserve', tabWidth: 2 }) } };
  } catch (e) {
    return { error: `Can’t format this SQL: ${(e as Error).message.split('\n')[0]}` };
  }
};
