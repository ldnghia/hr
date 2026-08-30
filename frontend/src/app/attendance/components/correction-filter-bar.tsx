'use client';

import { useTranslation } from 'react-i18next';
import { Input, Select, DatePicker } from 'antd';
import type { Dayjs } from 'dayjs';

export type CorrectionDateRange = [Dayjs | null, Dayjs | null] | null;

interface Props {
  onSearch: (value: string) => void;
  status?: string;
  onStatusChange: (value?: string) => void;
  dateRange: CorrectionDateRange;
  onDateRangeChange: (value: CorrectionDateRange) => void;
  /** Rendered on the right side of the row (e.g. the "+ Tạo yêu cầu mới" action button). */
  extra?: React.ReactNode;
}

/** Shared search/status/date-range filter bar for the correction request tables (mine + admin panel). Sits in its own row, separate from the table below. */
export function CorrectionFilterBar({ onSearch, status, onStatusChange, dateRange, onDateRangeChange, extra }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-56">
          <Input.Search
            allowClear
            placeholder={t('attendance.searchByReasonOrEmployee', 'Tìm kiếm...')}
            onSearch={onSearch}
          />
        </div>
        <div className="w-full sm:w-40">
          <Select
            allowClear
            placeholder={t('attendance.allStatuses', 'Tất cả trạng thái')}
            className="w-full"
            value={status}
            onChange={onStatusChange}
            options={[
              { value: 'pending', label: t('common.pending') },
              { value: 'approved', label: t('common.approved') },
              { value: 'rejected', label: t('common.rejected') },
              { value: 'cancelled', label: t('common.cancelled') },
            ]}
          />
        </div>
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(val) => onDateRangeChange(val as CorrectionDateRange)}
          className="w-full sm:w-auto"
        />
      </div>
      {extra}
    </div>
  );
}
