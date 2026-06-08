import { useContext } from 'react';
import { PrefsCtx } from './PreferencesContext';

export function usePreferences() {
  return useContext(PrefsCtx);
}
