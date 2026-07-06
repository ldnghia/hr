'use client';

import { Button } from 'antd';
import { RotateCw } from 'lucide-react';

interface Props {
  onClick: () => void;
  loading?: boolean;
}

/** Icon-only refresh button, sized to match the filter bar controls (reference: Mini ERP list toolbar). */
export function ReloadButton({ onClick, loading }: Props) {
  return (
    <Button onClick={onClick} loading={loading} icon={<RotateCw size={14} />} />
  );
}
