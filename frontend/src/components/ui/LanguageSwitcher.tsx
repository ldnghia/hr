'use client';

import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.slice(0, 2) ?? 'en';

  return (
    <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
      {LANGUAGES.map(({ code, label }, idx) => (
        <button
          key={code}
          onClick={() => {
          i18n.changeLanguage(code);
          localStorage.setItem('i18nextLng', code);
          }}
          className={[
            'px-2.5 py-1 transition-colors',
            idx !== 0 ? 'border-l border-gray-200' : '',
            current === code
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800',
          ].join(' ')}
          aria-pressed={current === code}
          aria-label={`Switch to ${label}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
