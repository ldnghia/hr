'use client';

import { useTranslation } from 'react-i18next';

interface Props {
  correctionRequestId?: number | null;
}

export function CorrectedBadge({ correctionRequestId }: Props) {
  const { t } = useTranslation();
  return (
    <span
      title={correctionRequestId ? t('attendance.correctionId', { id: correctionRequestId }) : t('attendance.correctedBadge')}
      className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
    >
      {t('attendance.correctedBadge')}
    </span>
  );
}
