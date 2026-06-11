/**
 * Applies the user's per-section accent colour whenever the route changes, and
 * hydrates the account's saved preferences once on mount. Renders nothing.
 * Must live inside the Router (it uses useLocation).
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePreferences } from '../contexts/usePreferences';
import { applyAccent, sectionIdForPath, DEFAULT_SECTION_ACCENTS } from '../lib/accents';

export default function AccentController() {
  const { pathname } = useLocation();
  const { sectionAccents, hydrateFromServer } = usePreferences();

  // Pull this account's saved preferences once when entering the app shell.
  useEffect(() => { hydrateFromServer(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recolour on every navigation or accent change.
  useEffect(() => {
    const section = sectionIdForPath(pathname);
    const accent  = sectionAccents[section] ?? DEFAULT_SECTION_ACCENTS[section];
    applyAccent(accent);
  }, [pathname, sectionAccents]);

  return null;
}
