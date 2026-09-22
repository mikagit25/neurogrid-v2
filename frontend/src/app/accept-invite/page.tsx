'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getInvitationInfo, acceptTeamInvitation } from '@/lib/api';
import { getToken } from '@/lib/auth';

const ROLE_LABELS: Record<string, string> = {
  analyst: 'Аналитик — только просмотр данных',
  manager: 'Менеджер — просмотр и управление правилами',
  admin: 'Администратор — полный доступ',
};

function AcceptInviteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [info, setInfo] = useState<{ email: string; owner_email: string; role: string; expires_at: string; accepted: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const isLoggedIn = !!getToken();

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getInvitationInfo(token)
      .then(setInfo)
      .catch(() => setError('Приглашение не найдено или истекло'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!isLoggedIn) {
      // Redirect to login/register with return URL
      router.push(`/login?redirect=/accept-invite?token=${encodeURIComponent(token)}`);
      return;
    }
    setAccepting(true);
    setError('');
    try {
      await acceptTeamInvitation(token);
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (e: any) {
      setError(e.message || 'Не удалось принять приглашение');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-purple-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-purple-600 rounded-2xl items-center justify-center mb-3">
            <span className="text-white text-2xl font-black">N</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">NeuroGrid</h1>
        </div>

        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Вы в команде!</h2>
            <p className="text-slate-500 text-sm">Переходим в дашборд...</p>
          </div>
        ) : error && !info ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Ошибка</h2>
            <p className="text-red-600 text-sm mb-6">{error}</p>
            <Link href="/dashboard" className="text-purple-600 hover:text-purple-700 text-sm font-medium">
              Перейти на главную →
            </Link>
          </div>
        ) : info ? (
          <>
            <h2 className="text-lg font-bold text-slate-900 text-center mb-1">Приглашение в команду</h2>
            <p className="text-slate-500 text-sm text-center mb-6">
              <strong className="text-slate-700">{info.owner_email}</strong> приглашает вас в своё рабочее пространство
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
              <div>
                <p className="text-xs text-slate-500">Ваша роль</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {ROLE_LABELS[info.role] ?? info.role}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Приглашение для</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{info.email}</p>
              </div>
              {info.accepted && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Это приглашение уже было принято ранее
                </div>
              )}
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</p>
            )}

            {!info.accepted && (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-sm"
              >
                {accepting ? 'Принимаем...' : isLoggedIn ? 'Принять приглашение' : 'Войти и принять'}
              </button>
            )}

            {!isLoggedIn && (
              <p className="text-center text-xs text-slate-500 mt-3">
                Нет аккаунта?{' '}
                <Link href={`/register?redirect=/accept-invite?token=${encodeURIComponent(token)}`}
                  className="text-purple-600 hover:text-purple-700 font-medium">
                  Зарегистрироваться
                </Link>
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteContent />
    </Suspense>
  );
}
