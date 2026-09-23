'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register, login, API_URL } from '@/lib/api';
import { setToken, setUser, isAuthenticated } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [pdConsent, setPdConsent] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [refCode, setRefCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('error') === 'google_failed') {
      setError('Не удалось войти через Google. Попробуйте ещё раз.');
    }
    if (sp.get('ref')) setRefCode(sp.get('ref')!);
    if (sp.get('promo')) setPromoCode(sp.get('promo')!);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Пароли не совпадают'); return; }
    if (password.length < 8) { setError('Пароль должен содержать не менее 8 символов'); return; }
    if (!agreed) { setError('Необходимо принять публичный договор оказания услуг'); return; }
    if (!pdConsent) { setError('Необходимо дать согласие на передачу данных платёжному партнёру'); return; }
    setLoading(true);
    try {
      await register(email, password, true, refCode.trim() || undefined, promoCode.trim() || undefined, true);
      const data = await login(email, password);
      setToken(data.token);
      setUser({
        id: data.user.id,
        email: data.user.email,
        balance: data.user.balance,
        isAdmin: data.user.is_admin,
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = agreed && pdConsent && !loading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">NeuroGrid</h1>
          <p className="text-slate-500 mt-2">Автоматизация маркетплейсов</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Создать аккаунт</h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {refCode && (
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-sm flex items-center gap-2">
              <span>🎁</span>
              <span>Вы регистрируетесь по реферальной ссылке — при первом пополнении получите <strong>+10% бонус</strong> к балансу</span>
            </div>
          )}

          {/* Google OAuth */}
          <a
            href={`${API_URL}/api/auth/google`}
            className="flex items-center justify-center gap-3 w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Зарегистрироваться через Google
          </a>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-slate-400">или через email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 8 символов" required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Подтвердите пароль</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Повторите пароль" required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            </div>

            {/* Promo / ref codes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Промо-код</label>
                <input type="text" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="WELCOME500"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Реферальный код</label>
                <input type="text" value={refCode} onChange={e => setRefCode(e.target.value.toUpperCase())} placeholder="NG-XXXXXXXX"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
              </div>
            </div>

            {/* Consent checkboxes */}
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <div className="flex items-start gap-2.5">
                <input id="agreement" type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer flex-shrink-0" />
                <label htmlFor="agreement" className="text-sm text-slate-600 cursor-pointer leading-snug">
                  Я ознакомлен(-а) и принимаю условия{' '}
                  <a href="/oferta" target="_blank" className="text-purple-600 hover:text-purple-700 underline">публичного договора оказания услуг</a>
                </label>
              </div>

              <div className="flex items-start gap-2.5">
                <input id="pd-consent" type="checkbox" checked={pdConsent} onChange={e => setPdConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer flex-shrink-0" />
                <label htmlFor="pd-consent" className="text-sm text-slate-600 cursor-pointer leading-snug">
                  Я согласен(-на) на передачу моих персональных данных (email, имя) платёжному оператору{' '}
                  <span className="font-medium text-slate-700">WebPay (ОАО «Белинвестбанк»)</span>{' '}
                  в целях обработки платёжных транзакций в соответствии с Законом РБ «О защите персональных данных» и ФЗ-152 РФ.{' '}
                  <a href="/privacy#payment-partner" target="_blank" className="text-purple-600 hover:text-purple-700 underline">Подробнее</a>
                </label>
              </div>
            </div>

            <button type="submit" disabled={!canSubmit}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors">
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            Уже есть аккаунт?{' '}
            <Link href="/login" className="text-purple-600 hover:text-purple-700 font-medium">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
