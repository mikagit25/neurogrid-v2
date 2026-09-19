import { ProductInfo } from '../../integrations/marketplace/base.adapter';

export interface ScoredProduct extends ProductInfo {
  score: number;           // 0–100
  scoreLabel: 'excellent' | 'good' | 'average' | 'poor';
  issues: string[];
  platform: 'wb' | 'ozon';
  connectionId: string;
}

const STOP_WORDS = new Set([
  'и','в','на','с','по','для','из','от','до','при','за','как','что','это',
  'или','а','но','же','то','бы','не','ни','уже','ещё','всё','так','вот',
]);

function countKeywords(text: string): number {
  const words = text.toLowerCase().match(/[а-яёa-z]{3,}/g) ?? [];
  const unique = new Set(words.filter((w) => !STOP_WORDS.has(w)));
  return unique.size;
}

export function scoreProduct(product: ProductInfo, platform: 'wb' | 'ozon'): { score: number; issues: string[] } {
  let score = 0;
  const issues: string[] = [];

  // Title (30 pts)
  const titleLen = product.title?.length ?? 0;
  if (titleLen >= 60) {
    score += 30;
  } else if (titleLen >= 30) {
    score += 15;
    issues.push(`Заголовок короткий (${titleLen} символов, нужно 60+)`);
  } else {
    issues.push(`Заголовок очень короткий (${titleLen} символов)`);
  }

  // Description (40 pts)
  const descLen = product.description?.length ?? 0;
  if (descLen >= 500) {
    score += 40;
  } else if (descLen >= 200) {
    score += 25;
    issues.push(`Описание короткое (${descLen} символов, нужно 500+)`);
  } else if (descLen > 0) {
    score += 10;
    issues.push(`Описание очень короткое (${descLen} символов)`);
  } else {
    issues.push('Описание отсутствует');
  }

  // Keyword density in description (20 pts)
  const fullText = `${product.title ?? ''} ${product.description ?? ''}`;
  const kwCount = countKeywords(fullText);
  if (kwCount >= 20) {
    score += 20;
  } else if (kwCount >= 10) {
    score += 10;
    issues.push(`Мало уникальных ключевых слов (${kwCount}, нужно 20+)`);
  } else {
    issues.push(`Очень мало ключевых слов (${kwCount})`);
  }

  // Price set (5 pts)
  if (product.price > 0) {
    score += 5;
  } else {
    issues.push('Цена не установлена');
  }

  // Stock (5 pts)
  if (product.stock > 0) {
    score += 5;
  } else if (product.stock === 0) {
    issues.push('Нет в наличии');
  }

  return { score: Math.min(100, score), issues };
}

export function scoreLabel(score: number): ScoredProduct['scoreLabel'] {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 35) return 'average';
  return 'poor';
}
