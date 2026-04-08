'use client';

import Image from 'next/image';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';

/**
 * LoginPage
 * 
 * Main entry point for the login route. Wraps the form in a Suspense boundary
 * because useSearchParams() triggers a client-side de-optimization if called
 * during SSR without a boundary.
 */
export default function LoginPage() {
  return (
    <div 
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4"
      suppressHydrationWarning
    >
      <div className="w-full max-w-md">
        <Suspense fallback={
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * LoginForm
 * 
 * Separate component to safely use useSearchParams() hooks inside a Suspense boundary.
 */
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login } = useAuth();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect already-authenticated users
  useEffect(() => {
    if (submitting) return;
    if (!loading && user) {
      router.replace(searchParams.get('from') ?? '/dashboard');
    }
  }, [loading, user, submitting, router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      const from = searchParams.get('from') ?? '/dashboard';
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
        errorMsg = 'Invalid email or password.';
      } else if (status === 403) {
        errorMsg = 'Your account has been deactivated. Please contact HR.';
      } else if (status !== undefined && status >= 500) {
        errorMsg = 'Server error. Please try again later.';
      } else if (rawMsg) {
        errorMsg = Array.isArray(rawMsg) ? rawMsg[0] : rawMsg;
      } else {
        errorMsg = 'Login failed. Please check your connection and try again.';
      }
      setError(errorMsg);
      setSubmitting(false);
    }
  }

  return (
    <>
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
        <p className="mt-0.5 text-sm font-medium text-indigo-600">Workforce Management</p>
        <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5" suppressHydrationWarning>
          <Input
            label="Email address"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

<<<<<<< HEAD
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
              disabled={loading || submitting}
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </div>
              ) : loading ? (
                'Verifying session…'
              ) : (
                'Sign in'
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
=======
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
>>>>>>> 762b79665a11a19db793d89066604d4937c1e248
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
                Signing in…
              </div>
            ) : loading ? (
              'Verifying session…'
            ) : (
              'Sign in'
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
    </>
  );
}
