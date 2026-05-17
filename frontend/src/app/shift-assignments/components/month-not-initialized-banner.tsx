'use client';

import { useState } from 'react';
import { shiftAssignmentService } from '@/services/shift-assignment.service';

interface Props {
  year: number;
  month: number;
  departmentId?: number;
  onInitialized: () => void;
}

export function MonthNotInitializedBanner({ year, month, departmentId, onInitialized }: Props) {
  const [loading, setLoading] = useState<'init' | 'copy' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInitialize = async () => {
    setLoading('init');
    setError(null);
    try {
      await shiftAssignmentService.initializeMonth({ year, month, departmentId });
      onInitialized();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra khi khởi tạo tháng';
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  const handleCopyPrevious = async () => {
    setLoading('copy');
    setError(null);
    try {
      const result = await shiftAssignmentService.copyFromPrevious({ year, month, departmentId });
      if (result.copied === 0) {
        setError('Tháng trước chưa có phân ca để sao chép.');
        return;
      }
      onInitialized();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Có lỗi xảy ra khi sao chép tháng trước';
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
      <div className="flex justify-center mb-3">
        <svg className="h-10 w-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-yellow-800 mb-1">
        Tháng {month}/{year} chưa có phân ca
      </h3>
      <p className="text-sm text-yellow-700 mb-5">
        Nhấn &quot;Khởi tạo&quot; để tự động gán ca cho tất cả nhân viên.
        Ca sẽ được gán theo phòng ban nếu phòng ban có ca liên kết,
        ngược lại sẽ dùng ca mặc định của nhân viên.
        Bạn có thể chỉnh sửa sau khi khởi tạo.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-center gap-3 flex-wrap">
        <button
          onClick={handleInitialize}
          disabled={loading !== null}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white
                     hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading === 'init' ? 'Đang khởi tạo...' : `Khởi tạo tháng ${month}/${year}`}
        </button>
        <button
          onClick={handleCopyPrevious}
          disabled={loading !== null}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium
                     text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading === 'copy' ? 'Đang sao chép...' : 'Sao chép tháng trước'}
        </button>
      </div>
    </div>
  );
}
