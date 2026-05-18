'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Applies the stored language preference after hydration.
 * Must run after first render so SSR and client HTML match before switching.
 */
export function I18nInitializer() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const stored = localStorage.getItem('language');
    if (stored && stored !== i18n.language) {
      i18n.changeLanguage(stored);
    }
  }, [i18n]);

  return null;
}
