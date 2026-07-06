import { Tag } from 'antd';

const COLOR_MAP: Record<string, string> = {
  warning: 'gold',
  success: 'green',
  error: 'volcano',
  default: 'default',
};

interface StatusTagProps {
  label: string;
  variant?: 'warning' | 'success' | 'error' | 'default';
}

/** Rounded pill status tag (bordered, light background) — matches the Mini ERP reference list style. */
export function StatusTag({ label, variant = 'default' }: StatusTagProps) {
  return (
    <Tag color={COLOR_MAP[variant]} style={{ borderRadius: 9999, paddingInline: 10 }}>
      {label}
    </Tag>
  );
}
