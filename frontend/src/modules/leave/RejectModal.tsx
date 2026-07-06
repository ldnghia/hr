'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input } from 'antd';

const { TextArea } = Input;

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (comments: string) => Promise<void>;
  employeeName?: string;
}

export function RejectModal({ open, onClose, onConfirm, employeeName }: RejectModalProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await onConfirm(comments);
      setComments('');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setComments('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={t('leave.rejectTitle')}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={t('leave.confirmReject')}
      cancelText={t('common.cancel')}
      okButtonProps={{ danger: true }}
    >
      <div className="space-y-4">
        {employeeName && (
          <p className="text-sm text-gray-600">
            {t('leave.rejectDescription', { name: '' })}
            <span className="font-medium text-gray-900">{employeeName}</span>.
          </p>
        )}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            {t('leave.rejectReason')}
          </label>
          <TextArea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder={t('leave.rejectReasonPlaceholder')}
          />
        </div>
      </div>
    </Modal>
  );
}
