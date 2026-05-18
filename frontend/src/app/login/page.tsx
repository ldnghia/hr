'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function LoginPage() {
  console.log('LoginPage.');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false); // ✅ FIX HYDRATION

  // ✅ ensure render only on client
  useEffect(() => {
    setMounted(true);
  }, [])
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

        </div>
      </div>
    </div>
  );
}