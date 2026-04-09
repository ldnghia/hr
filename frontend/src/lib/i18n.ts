'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

// Always initialize with 'vi' so the server-rendered HTML and the first client
// render agree on language. The stored preference is applied after hydration via
// I18nInitializer (see components/pwa/I18nInitializer.tsx).
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    lng: 'vi',
    fallbackLng: 'vi',
    supportedLngs: ['en', 'vi'],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;