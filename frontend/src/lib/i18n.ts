import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

const isBrowser = typeof window !== 'undefined';

// ❗ đọc language thủ công (KHÔNG dùng detector)
const savedLang = isBrowser ? localStorage.getItem('i18nextLng') : null;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    lng: savedLang || 'en', // ✅ FIX: server & client đồng bộ
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;