'use client';

import { I18nextProvider } from 'react-i18next';
import { AuthProvider } from '@/context/AuthContext';
import { I18nInitializer } from '@/components/pwa/I18nInitializer';
import i18n from '@/lib/i18n';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      {/* Applies stored language preference after hydration — must run before any
          translated content is interactive, but after the first render matches SSR. */}
      <I18nInitializer />
      <AuthProvider>{children}</AuthProvider>
    </I18nextProvider>
  );
}
