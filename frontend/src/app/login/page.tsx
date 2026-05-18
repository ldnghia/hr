'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Map OAuth error codes to user-friendly messages
  const OAUTH_ERRORS: Record<string, string> = {
    not_registered: 'Your Google account is not linked to any employee. Contact HR.',
    account_disabled: 'Your account is inactive. Contact HR.',
    account_conflict: 'This Google account is linked to a different employee.',
    oauth_failed: 'Google login failed. Please try again.',
  };
  const [mounted, setMounted] = useState(false); // ✅ FIX HYDRATION

  // ✅ ensure render only on client
  useEffect(() => {
    setMounted(true);
    // Show OAuth error from redirect query param
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.oauth_failed);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Redirect already-authenticated users (e.g. back-navigated to /login).
  // Guarded against `submitting` so this never races with handleSubmit's
  // direct router.replace() call in React 19 concurrent mode.
  useEffect(() => {
    if (submitting) return;
    if (!loading && user) {
      router.replace(searchParams.get('from') ?? '/dashboard');
    }
  }, [loading, user, submitting, router, searchParams]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      const from = searchParams.get('from') ?? '/dashboard';
      router.replace(from);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { message?: string | string[] } };
      };

      const status = axiosErr?.response?.status;
      const rawMsg = axiosErr?.response?.data?.message;

      let errorMsg: string;

      if (status === 401) {
        errorMsg = t('auth.invalidCredentials');
      } else if (status === 403) {
        errorMsg = 'Your account has been deactivated. Please contact HR.';
      } else if (status !== undefined && status >= 500) {
        errorMsg = 'Server error. Please try again later.';
      } else if (rawMsg) {
        errorMsg = Array.isArray(rawMsg) ? rawMsg[0] : rawMsg;
      } else {
        errorMsg = t('auth.loginFailed');
      }

      setError(errorMsg);
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      {/* Language switcher — fixed top-right */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md">

        {/* Loading */}
        {loading && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Verifying existing session…
          </div>
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Dcorp logo"
              width={56}
              height={56}
              className="h-14 w-auto object-contain"
              priority
            />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Dcorp</h1>

          <p className="mt-0.5 text-sm font-medium text-indigo-600">
            {t('auth.workforceManagement')}
          </p>

          <p className="mt-1 text-sm text-gray-500">
            {t('auth.signInTo')}
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label={t('auth.email')}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <Input
              label={t('auth.password')}
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              disabled={loading || submitting}
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('auth.signingIn')}
                </div>
              ) : loading ? (
                t('common.loading')
              ) : (
                t('auth.signIn')
              )}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            type="button"
            aria-label="Sign in with Google"
            onClick={() => {
              window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
            }}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {/* Google logo SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

        </div>
      </div>
    </div>
  );
}