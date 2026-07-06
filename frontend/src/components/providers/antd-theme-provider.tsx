'use client';

import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';

/** Global antd theme config. Screens opt into antd components individually — this only sets shared tokens/locale. */
export function AntdThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#4f46e5',
          borderRadius: 8,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, sans-serif',
        },
        components: {
          Table: {
            headerBg: '#ffffff',
            headerColor: '#6b7280',
            headerSplitColor: 'transparent',
            borderColor: '#f0f0f0',
            rowHoverBg: '#fafafa',
            cellPaddingBlock: 14,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
