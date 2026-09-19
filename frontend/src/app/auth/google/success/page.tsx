'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { setToken, setUser } from '@/lib/auth';
import { API_URL } from '@/lib/api';

function GoogleSuccessHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      router.replace('/login?error=google_failed');
      return;
    }

    fetch(`${API_URL}/api/auth/google/exchange?code=${encodeURIComponent(code)}`, {
      method: 'POST',
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.token) throw new Error('No token');
        setToken(data.token);
        setUser({
          id: data.user.id,
          email: data.user.email,
          balance: data.user.balance,
          isAdmin: data.user.is_admin,
        });
        router.replace('/dashboard');
      })
      .catch(() => {
        router.replace('/login?error=google_failed');
      });
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Выполняется вход через Google...</p>
      </div>
    </div>
  );
}

export default function GoogleSuccessPage() {
  return (
    <Suspense>
      <GoogleSuccessHandler />
    </Suspense>
  );
}
