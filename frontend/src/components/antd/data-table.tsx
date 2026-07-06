'use client';

import { Table } from 'antd';
import type { TableProps } from 'antd';

interface DataTableProps<T> extends TableProps<T> {
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number, pageSize: number) => void;
}

/**
 * Shared table shell for list screens (borderless rows, compact pagination — no page-size
 * selector, matching the Mini ERP reference layout). Screens pass their own columns/dataSource;
 * this only standardizes look and pagination wiring so new screens don't reimplement it.
 */
export function DataTable<T extends object>({
  page,
  pageSize,
  total,
  onPageChange,
  pagination,
  ...tableProps
}: DataTableProps<T>) {
  const resolvedPagination: TableProps<T>['pagination'] =
    pagination === false
      ? false
      : {
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: onPageChange,
          ...(pagination as object),
        };

  return (
    <Table<T>
      size="middle"
      pagination={resolvedPagination}
      {...tableProps}
    />
  );
}
