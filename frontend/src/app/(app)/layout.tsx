'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, setUser, clearToken } from '@/lib/auth';
import { getMe, getNotifications, markNotificationRead } from '@/lib/api';
import type { StoredUser } from '@/lib/auth';
import type { Notification } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import CommandPalette from '@/components/CommandPalette';
import OnboardingWizard from '@/components/OnboardingWizard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [ready, setReady] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    // Use cached user first for fast render
    const cached = getUser();
    if (cached) {
      setUserState(cached);
      setReady(true);
    }
    try {
      const { user: freshUser } = await getMe();
      const stored: StoredUser = {
        id: freshUser.id,
        email: freshUser.email,
        balance: freshUser.balance,
        isAdmin: freshUser.is_admin,
        isDemo: freshUser.is_demo,
        demoExpiresAt: freshUser.demo_expires_at,
      };
      setUser(stored);
      setUserState(stored);
    } catch {
      if (!cached) {
        clearToken();
        router.replace('/login');
      }
    } finally {
      setReady(true);
    }
  }, [router]);

  const loadNotifications = useCallback(async () => {
    try {
      const notifs = await getNotifications();
      setNotifications(notifs);
    } catch {
      // Ignore notification errors
    }
  }, []);

  useEffect(() => {
    loadUser();
    loadNotifications();
    // Poll for new notifications every 60s
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
  }, [loadUser, loadNotifications]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(p => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile + desktop top header */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between">
          <a href="/" className="md:hidden font-bold text-slate-900 text-lg hover:text-purple-600 transition-colors">NeuroGrid</a>
          {/* Command palette trigger */}
          <button
            onClick={() => setShowPalette(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <span>Поиск</span>
            <kbd className="ml-1 text-xs border border-slate-300 rounded px-1">⌘K</kbd>
          </button>
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-0.5">
                    <span className="text-white text-[10px] font-bold leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800 text-sm">Уведомления</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-slate-500 text-center">Нет уведомлений</p>
                    ) : (
                      notifications.slice(0, 20).map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-slate-50 last:border-0 ${
                            !n.is_read ? 'bg-purple-50/50' : ''
                          }`}
                        >
                          <p className="text-sm text-slate-700">{n.text}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-slate-400">
                              {new Date(n.created_at).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {!n.is_read && (
                              <button
                                onClick={() => handleMarkRead(n.id)}
                                className="text-xs text-purple-600 hover:text-purple-700"
                              >
                                Прочитано
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Balance chip */}
            {user && (
              <div className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {user.balance.toLocaleString('ru-RU')} ₽
              </div>
            )}
          </div>
        </header>
        {user?.isDemo && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-amber-800">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Демо-режим</strong> — вы просматриваете тестовый аккаунт с реалистичными данными. Сессия истечёт через 2 часа.
              </span>
            </div>
            <a
              href="/register"
              className="shrink-0 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Создать аккаунт →
            </a>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
      <MobileNav />
      <CommandPalette open={showPalette} onClose={() => setShowPalette(false)} />
      <OnboardingWizard />
      {/* Close notifications overlay */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}
