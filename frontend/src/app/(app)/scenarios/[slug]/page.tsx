'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getScenario, getConnections, createRun } from '@/lib/api';
import type { Scenario, Connection } from '@/lib/api';
import ScenarioForm from '@/components/ScenarioForm';

const PLATFORM_LABELS: Record<string, string> = {
  wb: 'WildBerries',
  ozon: 'Ozon',
};

export default function ScenarioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [s, conns] = await Promise.all([getScenario(slug), getConnections()]);
        setScenario(s);
        setConnections(conns);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  async function handleSubmit(inputData: Record<string, unknown>, connectionId?: string) {
    if (!scenario) return;
    setSubmitting(true);
    setError('');
    try {
      const { run } = await createRun(scenario.id, inputData, connectionId);
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !scenario) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
        <Link href="/scenarios" className="text-purple-600 hover:text-purple-700 font-medium text-sm">
          ← Назад к сценариям
        </Link>
      </div>
    );
  }

  if (!scenario) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/scenarios" className="text-slate-500 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{scenario.title}</h1>
      </div>

      {/* Scenario info card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
        <p className="text-slate-600">{scenario.description}</p>
        <div className="flex items-center gap-4 pt-1">
          <div>
            <span className="text-xs text-slate-500 block">Стоимость</span>
            <span className="text-xl font-bold text-purple-600">{scenario.price} ₽</span>
          </div>
          {scenario.platforms && scenario.platforms.length > 0 && (
            <div>
              <span className="text-xs text-slate-500 block mb-1">Платформы</span>
              <div className="flex gap-1.5">
                {scenario.platforms.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-medium"
                  >
                    {PLATFORM_LABELS[p] || p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Параметры запуска</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        <ScenarioForm
          slug={slug}
          connections={connections}
          onSubmit={handleSubmit}
          loading={submitting}
          price={scenario.price}
        />
      </div>
    </div>
  );
}
