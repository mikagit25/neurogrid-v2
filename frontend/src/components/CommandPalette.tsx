'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { globalSearch, SearchResult } from '@/lib/api';

const QUICK_LINKS = [
  { label: 'Дашборд', href: '/dashboard', icon: '📊', type: 'nav' },
  { label: 'Товары', href: '/products', icon: '📦', type: 'nav' },
  { label: 'Заказы', href: '/orders', icon: '🛒', type: 'nav' },
  { label: 'Склад', href: '/warehouse', icon: '🏭', type: 'nav' },
  { label: 'Финансы', href: '/finance', icon: '💰', type: 'nav' },
  { label: 'Возвраты', href: '/returns', icon: '↩️', type: 'nav' },
  { label: 'AI-ассистент', href: '/chat', icon: '💬', type: 'nav' },
  { label: 'AI-отчёты', href: '/reports', icon: '📑', type: 'nav' },
  { label: 'Анализ ниши', href: '/niche', icon: '🔍', type: 'nav' },
  { label: 'Юнит-экономика', href: '/calculator', icon: '🧮', type: 'nav' },
  { label: 'Подключения', href: '/connections', icon: '🔗', type: 'nav' },
  { label: 'Уведомления', href: '/notifications', icon: '🔔', type: 'nav' },
];

const TYPE_LABELS: Record<string, string> = {
  product: 'Товар',
  scenario: 'Сценарий',
  connection: 'Подключение',
  return: 'Возврат',
  nav: 'Навигация',
};

const TYPE_ICONS: Record<string, string> = {
  product: '📦',
  scenario: '⚡',
  connection: '🔗',
  return: '↩️',
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quickLinks = query.trim().length < 2
    ? QUICK_LINKS.filter(l => l.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  const allItems: Array<{ label: string; href: string; icon?: string; platform?: string | null; type: string }> = [
    ...quickLinks,
    ...results.map(r => ({ ...r, icon: TYPE_ICONS[r.type] })),
  ];

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await globalSearch(query.trim());
        setResults(r);
        setSelected(0);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 250);
  }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allItems.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && allItems[selected]) { navigate(allItems[selected].href); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, allItems, selected, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Поиск по разделам, товарам, заказам..."
            className="flex-1 outline-none text-slate-800 text-sm placeholder:text-slate-400 bg-transparent"
          />
          {loading && <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />}
          <kbd className="hidden sm:inline-flex text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {allItems.length === 0 && query.length >= 2 && !loading && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Ничего не найдено</p>
          )}

          {quickLinks.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Навигация</p>
              {quickLinks.map((item, i) => (
                <button
                  key={item.href}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => navigate(item.href)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected === i ? 'bg-purple-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="w-8 text-center text-lg shrink-0">{item.icon}</span>
                  <span className="text-sm text-slate-800">{item.label}</span>
                  <svg className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Результаты</p>
              {results.map((item, i) => {
                const idx = quickLinks.length + i;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => navigate(item.href)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected === idx ? 'bg-purple-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="w-8 text-center text-lg shrink-0">{TYPE_ICONS[item.type] ?? '•'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{item.label}</p>
                      <p className="text-xs text-slate-400">{TYPE_LABELS[item.type]}{item.platform ? ` · ${item.platform.toUpperCase()}` : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {allItems.length === 0 && query.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Начните печатать для поиска</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 flex gap-4 text-xs text-slate-400">
          <span><kbd className="border border-slate-200 rounded px-1">↑↓</kbd> навигация</span>
          <span><kbd className="border border-slate-200 rounded px-1">Enter</kbd> открыть</span>
          <span><kbd className="border border-slate-200 rounded px-1">Esc</kbd> закрыть</span>
        </div>
      </div>
    </div>
  );
}
