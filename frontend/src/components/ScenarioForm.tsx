'use client';

import { useState } from 'react';
import type { Connection } from '@/lib/api';

interface ScenarioFormProps {
  slug: string;
  connections: Connection[];
  onSubmit: (inputData: Record<string, unknown>, connectionId?: string) => Promise<void>;
  loading: boolean;
  price: number;
}

const SLUGS_NEEDING_CONNECTION = ['price-monitor', 'review-drafts', 'stock-forecast', 'seo-audit'];

export default function ScenarioForm({ slug, connections, onSubmit, loading, price }: ScenarioFormProps) {
  const needsConnection = SLUGS_NEEDING_CONNECTION.includes(slug);
  const [connectionId, setConnectionId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function getField(key: string): string {
    return fields[key] || '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (needsConnection && !connectionId) {
      setError('Выберите подключение к маркетплейсу');
      return;
    }

    let inputData: Record<string, unknown> = {};

    if (slug === 'card-generator') {
      if (!getField('productName').trim()) {
        setError('Введите название товара');
        return;
      }
      inputData = {
        productName: getField('productName').trim(),
        ...(getField('characteristics').trim() && { characteristics: getField('characteristics').trim() }),
        ...(getField('category').trim() && { category: getField('category').trim() }),
        platform: getField('platform') || 'wb',
      };
    } else if (slug === 'price-monitor') {
      if (!getField('sku').trim()) {
        setError('Введите артикул товара');
        return;
      }
      inputData = {
        sku: getField('sku').trim(),
        ...(getField('minPrice') && { minPrice: Number(getField('minPrice')) }),
        ...(getField('maxPrice') && { maxPrice: Number(getField('maxPrice')) }),
      };
    } else if (slug === 'review-drafts') {
      const limit = parseInt(getField('limit'), 10);
      inputData = {
        ...(limit && limit >= 1 && limit <= 30 && { limit }),
        ...(getField('storeTone').trim() && { storeTone: getField('storeTone').trim() }),
      };
    } else if (slug === 'stock-forecast') {
      const skusRaw = getField('skus').trim();
      const skusArray = skusRaw
        ? skusRaw.split('\n').map((s) => s.trim()).filter(Boolean)
        : [];
      const threshold = parseInt(getField('thresholdDays'), 10);
      inputData = {
        ...(threshold > 0 && { thresholdDays: threshold }),
        ...(skusArray.length > 0 && { skus: skusArray }),
      };
    } else if (slug === 'seo-audit') {
      if (!getField('sku').trim()) {
        setError('Введите артикул товара');
        return;
      }
      inputData = {
        sku: getField('sku').trim(),
      };
    } else if (slug === 'photo-generator') {
      if (!getField('productName').trim()) {
        setError('Введите название товара');
        return;
      }
      inputData = {
        productName: getField('productName').trim(),
        ...(getField('style') && { style: getField('style') }),
        ...(getField('description').trim() && { description: getField('description').trim() }),
      };
    } else if (slug === 'infographic-generator') {
      if (!getField('photoUrl').trim()) {
        setError('Введите URL фотографии');
        return;
      }
      if (!getField('features').trim()) {
        setError('Введите характеристики товара');
        return;
      }
      const featuresArray = getField('features')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
      if (featuresArray.length === 0) {
        setError('Введите хотя бы одну характеристику');
        return;
      }
      inputData = {
        photoUrl: getField('photoUrl').trim(),
        features: featuresArray,
        ...(getField('title').trim() && { title: getField('title').trim() }),
        ...(getField('accentColor').trim() && { accentColor: getField('accentColor').trim() }),
        ...(getField('bgColor').trim() && { bgColor: getField('bgColor').trim() }),
      };
    } else {
      inputData = { ...fields };
    }

    try {
      await onSubmit(inputData, needsConnection ? connectionId : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка запуска');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Connection selector */}
      {needsConnection && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Подключение к маркетплейсу <span className="text-red-500">*</span>
          </label>
          {connections.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Нет активных подключений. Добавьте подключение в разделе «Подключения».
            </p>
          ) : (
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">— Выберите подключение —</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} ({c.platform === 'wb' ? 'WildBerries' : 'Ozon'})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* card-generator */}
      {slug === 'card-generator' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Название товара <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={getField('productName')}
              onChange={(e) => setField('productName', e.target.value)}
              placeholder="Например: Смарт-часы Xiaomi Band 8"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Категория</label>
            <input
              type="text"
              value={getField('category')}
              onChange={(e) => setField('category', e.target.value)}
              placeholder="Например: Электроника / Умные часы"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Характеристики</label>
            <textarea
              value={getField('characteristics')}
              onChange={(e) => setField('characteristics', e.target.value)}
              placeholder="Цвет: чёрный, Экран: 1.62 дюйма, Батарея: 7 дней..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Платформа</label>
            <select
              value={getField('platform') || 'wb'}
              onChange={(e) => setField('platform', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="wb">WildBerries</option>
              <option value="ozon">Ozon</option>
            </select>
          </div>
        </>
      )}

      {/* price-monitor */}
      {slug === 'price-monitor' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Артикул (SKU) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={getField('sku')}
              onChange={(e) => setField('sku', e.target.value)}
              placeholder="Например: 12345678"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Мин. цена (₽)</label>
              <input
                type="number"
                value={getField('minPrice')}
                onChange={(e) => setField('minPrice', e.target.value)}
                placeholder="1000"
                min={0}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Макс. цена (₽)</label>
              <input
                type="number"
                value={getField('maxPrice')}
                onChange={(e) => setField('maxPrice', e.target.value)}
                placeholder="5000"
                min={0}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </>
      )}

      {/* review-drafts */}
      {slug === 'review-drafts' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Количество отзывов (1–30)</label>
            <input
              type="number"
              value={getField('limit')}
              onChange={(e) => setField('limit', e.target.value)}
              placeholder="10"
              min={1}
              max={30}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Тон магазина</label>
            <input
              type="text"
              value={getField('storeTone')}
              onChange={(e) => setField('storeTone', e.target.value)}
              placeholder="Например: дружелюбный, профессиональный"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </>
      )}

      {/* stock-forecast */}
      {slug === 'stock-forecast' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Порог дней (по умолчанию 14)</label>
            <input
              type="number"
              value={getField('thresholdDays')}
              onChange={(e) => setField('thresholdDays', e.target.value)}
              placeholder="14"
              min={1}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Артикулы (каждый с новой строки, необязательно)
            </label>
            <textarea
              value={getField('skus')}
              onChange={(e) => setField('skus', e.target.value)}
              placeholder={'12345678\n87654321\n11223344'}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono text-sm"
            />
          </div>
        </>
      )}

      {/* seo-audit */}
      {slug === 'seo-audit' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Артикул (SKU) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={getField('sku')}
            onChange={(e) => setField('sku', e.target.value)}
            placeholder="Например: 12345678"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      )}

      {/* photo-generator */}
      {slug === 'photo-generator' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Название товара <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={getField('productName')}
              onChange={(e) => setField('productName', e.target.value)}
              placeholder="Например: Кожаный кошелёк ручной работы"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Стиль фотографии</label>
            <select
              value={getField('style') || 'white-background'}
              onChange={(e) => setField('style', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="white-background">Белый фон</option>
              <option value="lifestyle">Лайфстайл</option>
              <option value="studio">Студийная</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Описание</label>
            <textarea
              value={getField('description')}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Дополнительное описание для генерации..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
        </>
      )}

      {/* infographic-generator */}
      {slug === 'infographic-generator' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              URL фотографии <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={getField('photoUrl')}
              onChange={(e) => setField('photoUrl', e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Характеристики (до 6 строк) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={getField('features')}
              onChange={(e) => setField('features', e.target.value)}
              placeholder={'Материал: натуральная кожа\nЦвет: коричневый\nРазмер: 12×9 см'}
              rows={5}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Заголовок</label>
            <input
              type="text"
              value={getField('title')}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="Название на инфографике"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Акцентный цвет</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={getField('accentColor') || '#7c3aed'}
                  onChange={(e) => setField('accentColor', e.target.value)}
                  className="h-10 w-10 rounded border border-slate-300 cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={getField('accentColor')}
                  onChange={(e) => setField('accentColor', e.target.value)}
                  placeholder="#7c3aed"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Цвет фона</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={getField('bgColor') || '#ffffff'}
                  onChange={(e) => setField('bgColor', e.target.value)}
                  className="h-10 w-10 rounded border border-slate-300 cursor-pointer p-1"
                />
                <input
                  type="text"
                  value={getField('bgColor')}
                  onChange={(e) => setField('bgColor', e.target.value)}
                  placeholder="#ffffff"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={loading || (needsConnection && connections.length === 0)}
        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Запуск...
          </>
        ) : (
          <>
            Запустить — {price} ₽
          </>
        )}
      </button>
    </form>
  );
}
