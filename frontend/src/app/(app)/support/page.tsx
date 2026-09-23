'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  SupportTicket, SupportReply, SUPPORT_TOPICS,
  createSupportTicket, getSupportTickets, getSupportTicket, replySupportTicket,
} from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { open: 'Открыто', replied: 'Отвечено', closed: 'Закрыто' };
const STATUS_CLASS: Record<string, string> = {
  open:    'bg-amber-100 text-amber-700',
  replied: 'bg-blue-100 text-blue-700',
  closed:  'bg-gray-100 text-gray-500',
};
const TOPIC_LABEL: Record<string, string> = Object.fromEntries(SUPPORT_TOPICS.map(t => [t.value, t.label]));

function fmtDate(s: string) {
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function NewTicketForm({ onCreated }: { onCreated: () => void }) {
  const [topic, setTopic]     = useState('tech');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await createSupportTicket({ topic, subject, message });
      setSubject(''); setMessage(''); setTopic('tech');
      onCreated();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-slate-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-slate-800">Новое обращение</h2>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Тема обращения</label>
        <select
          value={topic}
          onChange={e => setTopic(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {SUPPORT_TOPICS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Краткое описание</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Опишите проблему в одной строке"
          required
          maxLength={200}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Подробное сообщение</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Опишите ситуацию подробно..."
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? 'Отправка...' : 'Отправить обращение'}
      </button>
    </form>
  );
}

function TicketDialog({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [ticket, setTicket]   = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<SupportReply[]>([]);
  const [reply, setReply]     = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    const { ticket: t, replies: r } = await getSupportTicket(ticketId);
    setTicket(t); setReplies(r);
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError('');
    try {
      await replySupportTicket(ticketId, reply);
      setReply('');
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setSending(false); }
  }

  if (!ticket) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 w-16 h-16 flex items-center justify-center">
        <div className="w-6 h-6 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{TOPIC_LABEL[ticket.topic] ?? ticket.topic}</p>
            <h3 className="font-semibold text-slate-800">{ticket.subject}</h3>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[ticket.status]}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Dialog thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Original message */}
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-500">Вы</div>
            <div className="flex-1 bg-slate-50 rounded-xl rounded-tl-none px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{fmtDate(ticket.created_at)}</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.message}</p>
            </div>
          </div>

          {replies.map(r => (
            <div key={r.id} className={`flex gap-3 ${r.is_admin ? '' : 'flex-row-reverse'}`}>
              <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
                ${r.is_admin ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-500'}`}>
                {r.is_admin ? 'НГ' : 'Вы'}
              </div>
              <div className={`flex-1 rounded-xl px-4 py-3 max-w-[85%]
                ${r.is_admin ? 'bg-purple-50 rounded-tl-none' : 'bg-slate-50 rounded-tr-none'}`}>
                <p className="text-xs text-slate-400 mb-1">{fmtDate(r.created_at)}{r.is_admin ? ' · Служба поддержки' : ''}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.message}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Reply form */}
        {ticket.status !== 'closed' && (
          <form onSubmit={handleReply} className="p-4 border-t border-slate-100 space-y-2">
            {error && <p className="text-red-600 text-xs">{error}</p>}
            <div className="flex gap-2">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Напишите ответ..."
                rows={2}
                required
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors self-end"
              >
                {sending ? '...' : 'Отправить'}
              </button>
            </div>
          </form>
        )}
        {ticket.status === 'closed' && (
          <p className="p-4 text-center text-sm text-slate-400 border-t border-slate-100">Обращение закрыто</p>
        )}
      </div>
    </div>
  );
}

export default function SupportPage() {
  const [tickets, setTickets]     = useState<SupportTicket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTickets((await getSupportTickets()).tickets); }
    catch { setTickets([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function onCreated() { setShowForm(false); load(); }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Обращения в поддержку</h1>
          <p className="text-slate-500 text-sm mt-0.5">Задайте вопрос или сообщите о проблеме</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Новое обращение
        </button>
      </div>

      {showForm && <NewTicketForm onCreated={onCreated} />}

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Загрузка...</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-sm">У вас пока нет обращений</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-purple-600 text-sm hover:underline">
            Создать первое обращение
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {tickets.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4 ${i > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 mb-0.5">{TOPIC_LABEL[t.topic] ?? t.topic}</p>
                <p className="font-medium text-slate-800 truncate">{t.subject}</p>
                <p className="text-xs text-slate-400 mt-0.5">{fmtDate(t.updated_at)} · {t.reply_count} ответов</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_CLASS[t.status]}`}>
                {STATUS_LABEL[t.status]}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedId && <TicketDialog ticketId={selectedId} onClose={() => setSelected(null)} />}
    </div>
  );
}
