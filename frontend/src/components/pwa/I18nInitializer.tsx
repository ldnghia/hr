'use client';

import { useEffect } from 'react';
import i18n from '@/lib/i18n';

/**
 * Applies the user's stored language preference after hydration.
 *
 * i18n always initializes with 'vi' so SSR and the first client render agree
 * (no hydration mismatch). This component runs once after mount and switches
 * to the localStorage value if it differs from the default.
 */
export function I18nInitializer() {
  useEffect(() => {
    const saved = localStorage.getItem('i18nextLng');
    if (saved && saved !== i18n.language) {
      i18n.changeLanguage(saved);
    }
  }, []);

  return null;
}
