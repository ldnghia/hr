'use client';

import { useTranslation } from 'react-i18next';

/** Shown at top of attendance page when the page is served over plain HTTP. */
export function HttpsWarningBanner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <p>
        <span className="font-semibold">{t('attendance.httpsWarning')}</span>{' '}
        {t('attendance.httpsWarningDesc')}
      </p>
    </div>
  );
}
