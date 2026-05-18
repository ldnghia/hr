'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function OAuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');

    if (token) {
      localStorage.setItem('token', token);
      router.replace('/dashboard');
    } else {
      router.replace(`/login?error=${error ?? 'oauth_failed'}`);
    }
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        <span className="text-sm">Signing you in…</span>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
      </div>
    }>
      <OAuthCallbackInner />
    </Suspense>
  );
}
