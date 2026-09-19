'use client';

import { useState } from 'react';
import type { Connection } from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';

interface ScenarioFormProps {
  slug: string;
  connections: Connection[];
  onSubmit: (inputData: Record<string, unknown>, connectionId?: string) => Promise<void>;
  loading: boolean;
  price: number;
}

const SLUGS_NEEDING_CONNECTION = ['price-monitor', 'review-drafts', 'stock-forecast', 'seo-audit'];

interface Enhancement {
  enabled: boolean;
  setting?: string;
  text?: string;
  textStyle?: string;
  season?: string;
  companion?: string;
  bgDescription?: string;
}

interface Enhancements {
  lifestyle: Enhancement;
  textOverlay: Enhancement;
  seasonal: Enhancement;
  companion: Enhancement;
  customBg: Enhancement;
}

const SEASONAL_OPTIONS = [
  { value: 'new-year', label: 'Новый год / Рождество' },
  { value: 'valentine', label: '14 февраля — День влюблённых' },
  { value: 'march8', label: '8 марта' },
  { value: 'summer', label: 'Лето / отпуск' },
  { value: 'autumn', label: 'Осень / уют' },
];

const LIFESTYLE_PRESETS = [
  'На рабочем столе',
  'В уютном интерьере',
  'На кухне',
  'В спальне',
  'На открытом воздухе',
];

export default function ScenarioForm({ slug, connections, onSubmit, loading, price }: ScenarioFormProps) {
  const needsConnection = SLUGS_NEEDING_CONNECTION.includes(slug);
  const [connectionId, setConnectionId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<string[]>(['', '', '', '', '']);
  const [enhancements, setEnhancements] = useState<Enhancements>({
    lifestyle:   { enabled: false, setting: '' },
    textOverlay: { enabled: false, text: '', textStyle: 'badge' },
    seasonal:    { enabled: false, season: 'new-year' },
    companion:   { enabled: false, companion: '' },
    customBg:    { enabled: false, bgDescription: '' },
  });
  const [showEnhancements, setShowEnhancements] = useState(false);
  const [error, setError] = useState('');

  function patchEnhancement(key: keyof Enhancements, patch: Partial<Enhancement>) {
    setEnhancements((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

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
        ...(getField('referenceImageUrl').trim() && { referenceImageUrl: getField('referenceImageUrl').trim() }),
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
    } else if (slug === 'multi-photo-studio') {
      if (!getField('productName').trim()) {
        setError('Введите название товара');
        return;
      }
      const validUrls = photoUrls.filter(Boolean);
      if (validUrls.length === 0) {
        setError('Загрузите хотя бы одно фото товара');
        return;
      }
      // Collect enabled enhancements
      const activeEnhancements = [];
      if (enhancements.lifestyle.enabled && enhancements.lifestyle.setting?.trim()) {
        activeEnhancements.push({ type: 'lifestyle', setting: enhancements.lifestyle.setting.trim() });
      }
      if (enhancements.textOverlay.enabled && enhancements.textOverlay.text?.trim()) {
        activeEnhancements.push({ type: 'text-overlay', text: enhancements.textOverlay.text.trim(), style: enhancements.textOverlay.textStyle || 'badge' });
      }
      if (enhancements.seasonal.enabled && enhancements.seasonal.season) {
        activeEnhancements.push({ type: 'seasonal', season: enhancements.seasonal.season });
      }
      if (enhancements.companion.enabled && enhancements.companion.companion?.trim()) {
        activeEnhancements.push({ type: 'companion', product: enhancements.companion.companion.trim() });
      }
      if (enhancements.customBg.enabled && enhancements.customBg.bgDescription?.trim()) {
        activeEnhancements.push({ type: 'custom-bg', description: enhancements.customBg.bgDescription.trim() });
      }
      inputData = {
        productName: getField('productName').trim(),
        photoUrls: validUrls,
        style: getField('studioStyle') || 'studio-3d',
        enhancements: activeEnhancements,
      };
    } else if (slug === 'niche-analysis') {
      if (!getField('keyword').trim()) {
        setError('Введите ключевое слово для поиска');
        return;
      }
      inputData = {
        keyword: getField('keyword').trim(),
        platform: getField('platform') || 'wb',
        limit: Number(getField('limit') || 50),
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
          <ImageUpload
            value={getField('referenceImageUrl')}
            onChange={(url) => setField('referenceImageUrl', url)}
            label="Фото товара (необязательно)"
            hint="Загрузите фото — AI заменит фон, сохранив товар. Без фото создаст образ с нуля."
          />
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
          <ImageUpload
            value={getField('photoUrl')}
            onChange={(url) => setField('photoUrl', url)}
            label="Фото товара *"
            hint="Загрузите фото товара для создания инфографики"
          />
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

      {/* multi-photo-studio */}
      {slug === 'multi-photo-studio' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Название товара <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={getField('productName')}
              onChange={(e) => setField('productName', e.target.value)}
              placeholder="Например: Кожаная сумка через плечо"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Стиль результата</label>
            <select
              value={getField('studioStyle') || 'studio-3d'}
              onChange={(e) => setField('studioStyle', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="studio-3d">Studio 3D — белый/серый фон, 3/4 вид</option>
              <option value="floating">Floating — белый фон, парящий эффект</option>
              <option value="dark-premium">Dark Premium — тёмный фон, люксовый стиль</option>
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Фотографии товара <span className="text-red-500">*</span>
              <span className="text-slate-400 font-normal ml-1">(1–5 штук, разные ракурсы)</span>
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Загрузите фото спереди, сбоку, сзади — ИИ объединит их в профессиональный 3D-вид
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {photoUrls.map((url, i) => (
                <ImageUpload
                  key={i}
                  value={url}
                  onChange={(newUrl) => {
                    const updated = [...photoUrls];
                    updated[i] = newUrl;
                    setPhotoUrls(updated);
                  }}
                  label={i === 0 ? 'Фото 1 — основное *' : `Фото ${i + 1} — дополнительное`}
                />
              ))}
            </div>
            {photoUrls.filter(Boolean).length > 0 && (
              <p className="text-xs text-purple-600 mt-2">
                {photoUrls.filter(Boolean).length} из 5 фото загружено
              </p>
            )}
          </div>

          {/* ── Enhancements ── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowEnhancements((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm"
            >
              <span className="font-medium text-slate-700 flex items-center gap-2">
                ✨ Дополнительные виды
                {Object.values(enhancements).filter((e) => e.enabled).length > 0 && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                    +{Object.values(enhancements).filter((e) => e.enabled).length}
                  </span>
                )}
              </span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${showEnhancements ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showEnhancements && (
              <div className="divide-y divide-slate-100">

                {/* Lifestyle */}
                <div className="px-4 py-3 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={enhancements.lifestyle.enabled}
                      onChange={(e) => patchEnhancement('lifestyle', { enabled: e.target.checked })}
                      className="h-4 w-4 text-purple-600 rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-800">🏠 Lifestyle фото — товар в контексте</span>
                  </label>
                  {enhancements.lifestyle.enabled && (
                    <div className="ml-7 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {LIFESTYLE_PRESETS.map((p) => (
                          <button key={p} type="button"
                            onClick={() => patchEnhancement('lifestyle', { setting: p })}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${enhancements.lifestyle.setting === p ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-300 text-slate-600 hover:border-purple-400'}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={enhancements.lifestyle.setting ?? ''}
                        onChange={(e) => patchEnhancement('lifestyle', { setting: e.target.value })}
                        placeholder="Или напишите свой вариант: на пляже, в машине..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500" />
                    </div>
                  )}
                </div>

                {/* Text overlay */}
                <div className="px-4 py-3 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={enhancements.textOverlay.enabled}
                      onChange={(e) => patchEnhancement('textOverlay', { enabled: e.target.checked })}
                      className="h-4 w-4 text-purple-600 rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-800">🏷️ Текст на изображении — акция, название</span>
                  </label>
                  {enhancements.textOverlay.enabled && (
                    <div className="ml-7 space-y-2">
                      <input type="text" value={enhancements.textOverlay.text ?? ''}
                        onChange={(e) => patchEnhancement('textOverlay', { text: e.target.value })}
                        placeholder="Например: Скидка 20%, Хит продаж, Новинка 2025"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500" />
                      <div className="flex gap-2">
                        {[{ v: 'badge', l: 'Бейдж' }, { v: 'banner', l: 'Баннер' }, { v: 'price-tag', l: 'Ценник' }].map(({ v, l }) => (
                          <button key={v} type="button"
                            onClick={() => patchEnhancement('textOverlay', { textStyle: v })}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${enhancements.textOverlay.textStyle === v ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-300 text-slate-600 hover:border-purple-400'}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Seasonal */}
                <div className="px-4 py-3 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={enhancements.seasonal.enabled}
                      onChange={(e) => patchEnhancement('seasonal', { enabled: e.target.checked })}
                      className="h-4 w-4 text-purple-600 rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-800">🎄 Сезонное / праздничное фото</span>
                  </label>
                  {enhancements.seasonal.enabled && (
                    <div className="ml-7">
                      <select value={enhancements.seasonal.season ?? 'new-year'}
                        onChange={(e) => patchEnhancement('seasonal', { season: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-purple-500">
                        {SEASONAL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Companion product */}
                <div className="px-4 py-3 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={enhancements.companion.enabled}
                      onChange={(e) => patchEnhancement('companion', { enabled: e.target.checked })}
                      className="h-4 w-4 text-purple-600 rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-800">🛍️ С попутным товаром — комплект, сочетание</span>
                  </label>
                  {enhancements.companion.enabled && (
                    <div className="ml-7">
                      <input type="text" value={enhancements.companion.companion ?? ''}
                        onChange={(e) => patchEnhancement('companion', { companion: e.target.value })}
                        placeholder="Например: с чашкой кофе, со смартфоном, с ноутбуком"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500" />
                      <p className="text-xs text-slate-400 mt-1">ИИ расположит товары рядом в профессиональной постановке</p>
                    </div>
                  )}
                </div>

                {/* Custom background */}
                <div className="px-4 py-3 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={enhancements.customBg.enabled}
                      onChange={(e) => patchEnhancement('customBg', { enabled: e.target.checked })}
                      className="h-4 w-4 text-purple-600 rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-800">🎨 Кастомный фон — материал, цвет, текстура</span>
                  </label>
                  {enhancements.customBg.enabled && (
                    <div className="ml-7">
                      <input type="text" value={enhancements.customBg.bgDescription ?? ''}
                        onChange={(e) => patchEnhancement('customBg', { bgDescription: e.target.value })}
                        placeholder="Например: дубовый стол, мраморная плитка, бетонная стена"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500" />
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </>
      )}

      {/* niche-analysis */}
      {slug === 'niche-analysis' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ключевое слово / ниша <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={getField('keyword')}
              onChange={(e) => setField('keyword', e.target.value)}
              placeholder="Например: беспроводные наушники, детские игрушки, кофемашина"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Маркетплейс</label>
              <select
                value={getField('platform') || 'wb'}
                onChange={(e) => setField('platform', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="wb">Wildberries</option>
                <option value="ozon">Ozon</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Кол-во товаров для анализа</label>
              <select
                value={getField('limit') || '50'}
                onChange={(e) => setField('limit', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="30">30 товаров (быстро)</option>
                <option value="50">50 товаров (рекомендуется)</option>
                <option value="100">100 товаров (подробно)</option>
              </select>
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
