'use client';

// NOTE: useSearchParams() in a 'use client' page does NOT need a Suspense
// wrapper — that rule applies only to Server Components.  Adding Suspense
// inside a 'use client' component causes a hydration mismatch: the server
// renders the Suspense fallback as plain HTML, but the client tries to
// reconcile a <Suspense> boundary node → React throws a hydration error.
// Solution: use useSearchParams() directly here, no Suspense needed.

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login } = useAuth();
  const { t } = useTranslation();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
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
    console.log('[login] Form submitted, email:', email);
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // Direct redirect — more reliable than relying on a useEffect under
      // React 19's concurrent scheduler, where router.replace() queued from
      // a useEffect can be deferred or dropped after a batched state update.
      const from = searchParams.get('from') ?? '/dashboard';
      console.log('[login] Success — redirecting to', from);
      router.replace(from);
    } catch (err: unknown) {
      console.warn('[login] login() failed:', err);
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
  // ❌ tránh render SSR mismatch
  if (!mounted) return null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="w-full max-w-md">
        {/* Language switcher — top right */}
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        {/* Session verification banner */}
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
          <p className="mt-0.5 text-sm font-medium text-indigo-600">{t('auth.workforceManagement')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('auth.signInTo')}</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5" suppressHydrationWarning>
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
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
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

          {/* Demo accounts */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Demo accounts
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Admin',    email: 'admin@company.com',    color: 'hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700' },
                { label: 'HR',       email: 'hr@company.com',       color: 'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700' },
                { label: 'Manager',  email: 'manager@company.com',  color: 'hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700' },
                { label: 'Employee', email: 'employee@company.com', color: 'hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700' },
              ].map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword('password123');
                  }}
                  className={`rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors text-left ${acc.color}`}
                >
                  <span className="font-semibold">{acc.label}</span>
                  <br />
                  <span className="text-gray-400 truncate block">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
