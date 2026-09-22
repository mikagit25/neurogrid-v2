'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getChatHistory, sendChatMessage, clearChatHistory, getChatBriefing, type ChatMessage, type ChatBriefing } from '@/lib/api';

function renderBriefingMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-slate-900 mt-2 mb-0.5 text-sm">{line.slice(3)}</h2>;
    if (line.startsWith('# '))  return <h1 key={i} className="font-bold text-slate-900 mt-2 mb-1">{line.slice(2)}</h1>;
    if (line.trim() === '') return null;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="text-sm text-slate-700 leading-relaxed">
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} className="text-slate-900">{p.slice(2, -2)}</strong>
            : p
        )}
      </p>
    );
  }).filter(Boolean);
}

function BriefingCard({ briefing, onAsk }: { briefing: ChatBriefing; onAsk: (q: string) => void }) {
  const k = briefing.kpis;
  return (
    <div className="w-full max-w-lg mx-auto bg-white border border-purple-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 flex items-center gap-2">
        <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-white text-sm font-semibold">Утренний брифинг</span>
        <span className="ml-auto text-white/60 text-xs">{new Date(briefing.generated_at).toLocaleDateString('ru-RU')}</span>
      </div>
      <div className="px-4 py-3 space-y-1">
        {renderBriefingMarkdown(briefing.briefing)}
      </div>
      {(k.unread_alerts > 0 || k.critical_stock > 0) && (
        <div className="mx-4 mb-3 flex gap-2 flex-wrap">
          {k.unread_alerts > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{k.unread_alerts} уведомл.</span>
          )}
          {k.critical_stock > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{k.critical_stock} критич. остатков</span>
          )}
        </div>
      )}
      <div className="border-t border-slate-100 px-4 py-2 flex gap-2 flex-wrap">
        {['Что мне сделать сегодня?', 'Анализ продаж за неделю', 'Как улучшить топ-товар?'].map(q => (
          <button
            key={q}
            onClick={() => onAsk(q)}
            className="text-xs px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: 'Анализ бизнеса', prompt: 'Сделай краткий анализ моего бизнеса: что хорошо, что требует внимания и какие 3 первоочередных действия ты рекомендуешь?' },
  { label: 'Ценовая стратегия', prompt: 'Дай советы по ценовой стратегии для моих товаров с учётом конкурентной среды на маркетплейсах.' },
  { label: 'SEO и карточки', prompt: 'Как улучшить SEO и качество карточек товаров? На что обратить внимание в первую очередь?' },
  { label: 'Рост продаж', prompt: 'Какие 5 инструментов NeuroGrid помогут мне вырасти в продажах в следующем месяце?' },
];

function MessageBubble({ msg }: { msg: ChatMessage | { role: 'user' | 'assistant'; content: string; id: string; created_at: string } }) {
  const isUser = msg.role === 'user';

  // Simple markdown renderer: bold, lists, headers
  function renderMarkdown(text: string) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} className="font-bold text-slate-900 mt-3 mb-1 text-sm">{line.slice(4)}</h3>;
      if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-slate-900 mt-3 mb-1">{line.slice(3)}</h2>;
      if (line.startsWith('# ')) return <h1 key={i} className="font-bold text-slate-900 mt-3 mb-1 text-lg">{line.slice(2)}</h1>;
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = renderInline(line.slice(2));
        return <li key={i} className="ml-4 list-disc text-slate-700 text-sm">{content}</li>;
      }
      if (/^\d+\./.test(line)) {
        const content = renderInline(line.replace(/^\d+\.\s*/, ''));
        return <li key={i} className="ml-4 list-decimal text-slate-700 text-sm">{content}</li>;
      }
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} className="text-sm text-slate-700 leading-relaxed">{renderInline(line)}</p>;
    });
  }

  function renderInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-slate-100 text-slate-800 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      return part;
    });
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isUser ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
        {isUser ? 'Я' : 'AI'}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 rounded-tl-sm'}`}>
        {isUser ? (
          <p className="text-sm text-white">{msg.content}</p>
        ) : (
          <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
        )}
        <p className={`text-xs mt-1.5 ${isUser ? 'text-purple-200' : 'text-slate-400'}`}>
          {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [briefing, setBriefing] = useState<ChatBriefing | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => {
    getChatHistory()
      .then(({ messages: msgs }) => {
        setMessages(msgs);
        scrollToBottom();
        if (msgs.length === 0) {
          getChatBriefing().then(setBriefing).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scrollToBottom]);

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const tempId = `temp-${Date.now()}`;
    const userMsg: ChatMessage = { id: tempId, role: 'user', content, created_at: new Date().toISOString() };
    setMessages(ms => [...ms, userMsg]);
    setInput('');
    setError('');
    setSending(true);
    scrollToBottom();

    try {
      const { reply } = await sendChatMessage(content);
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      };
      setMessages(ms => [...ms, assistantMsg]);
      scrollToBottom();
    } catch (e: any) {
      setError(e.message || 'Ошибка отправки');
      setMessages(ms => ms.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleClear() {
    if (!confirm('Очистить историю переписки?')) return;
    await clearChatHistory().catch(() => {});
    setMessages([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = !loading && messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-h-[900px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI-ассистент</h1>
          <p className="text-slate-500 text-sm mt-0.5">Задайте любой вопрос о вашем бизнесе на маркетплейсах</p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
            Очистить
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-4">
            {briefing ? (
              <BriefingCard briefing={briefing} onAsk={p => handleSend(p)} />
            ) : (
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
            )}
            {!briefing && (
              <div className="text-center">
                <p className="font-semibold text-slate-800">С чего начнём?</p>
                <p className="text-sm text-slate-500 mt-1">Спросите что угодно о вашем бизнесе или выберите быстрое действие</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.label}
                  onClick={() => handleSend(a.prompt)}
                  className="p-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-600">AI</div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Quick actions shown above input when there are messages */}
      {!isEmpty && (
        <div className="flex gap-2 overflow-x-auto pb-2 flex-shrink-0">
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => handleSend(a.prompt)}
              disabled={sending}
              className="text-xs whitespace-nowrap px-3 py-1.5 bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-600 rounded-full transition-colors disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-600 mb-2 flex-shrink-0">{error}</p>}

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Напишите вопрос... (Enter — отправить, Shift+Enter — новая строка)"
          rows={2}
          disabled={sending}
          className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:opacity-60"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || sending}
          className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
