'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Ошибка сервера');
      setSent(true);
    } catch {
      setError('Не удалось отправить запрос. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">NeuroGrid</h1>
          <p className="text-slate-500 mt-2">Автоматизация маркетплейсов</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">Письмо отправлено</h2>
              <p className="text-slate-500 text-sm mb-6">
                Если аккаунт с адресом <strong>{email}</strong> существует,
                на него придёт письмо со ссылкой для сброса пароля.
                Проверьте папку «Спам», если письмо не пришло.
              </p>
              <Link href="/login" className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                ← Вернуться ко входу
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">Забыли пароль?</h2>
              <p className="text-slate-500 text-sm mb-6">
                Введите email — пришлём ссылку для сброса пароля.
              </p>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Отправка...' : 'Отправить ссылку'}
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-slate-500">
                <Link href="/login" className="text-purple-600 hover:text-purple-700 font-medium">
                  ← Вернуться ко входу
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
