import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers } from './Providers';
import { VersionCheckProvider } from '@/components/version-check-provider';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#4f46e5',
};

export const metadata: Metadata = {
  title: 'HR System',
  description: 'HR Management — attendance, leave, and more',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HR System',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full" suppressHydrationWarning>
      <head>
        {/* Workaround for browser extensions (Brownie/Bloom) that cause hydration mismatches.
            next/script with beforeInteractive is the correct way to inject inline scripts
            in App Router — plain <script> tags inside RSC are not executed by Turbopack. */}
        <Script
          id="bis-skin-fix"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var o=new MutationObserver(function(ms){for(var m of ms){if(m.type==='attributes'&&m.attributeName==='bis_skin_checked'){m.target.removeAttribute('bis_skin_checked');}}});o.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['bis_skin_checked']});})();`,
          }}
        />
      </head>
      <body className="h-full bg-gray-50 antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
        <VersionCheckProvider />
      </body>
    </html>
  );
}
