import axios from 'axios';
import { db } from '../../db';
import { createAdapter } from '../../integrations/marketplace/factory';
import { decrypt } from '../../utils/encryption';

// ---- Keyword position search ----

async function searchWbPosition(keyword: string, sku: string): Promise<{ position: number | null; page: number | null }> {
  try {
    // WB public search API (no auth required)
    const resp = await axios.get('https://search.wb.ru/exactmatch/ru/common/v4/search', {
      params: { query: keyword, resultset: 'catalog', limit: 100, sort: 'popular', dest: -1257786 },
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const products: any[] = resp.data?.data?.products ?? [];
    const idx = products.findIndex((p: any) => String(p.id) === sku);
    if (idx === -1) return { position: null, page: null };
    return { position: idx + 1, page: 1 };
  } catch {
    return { position: null, page: null };
  }
}

async function searchOzonPosition(keyword: string, sku: string, credentials: any): Promise<{ position: number | null; page: number | null }> {
  try {
    // Ozon search via seller API — use product search
    const client = axios.create({
      baseURL: 'https://api-seller.ozon.ru',
      headers: { 'Client-Id': credentials.clientId, 'Api-Key': credentials.apiKey },
      timeout: 10_000,
    });
    const resp = await client.post('/v1/analytics/search-phrases', {
      search_phrase: keyword, total_count: 50,
    });
    // Ozon search phrase analytics returns top products for that keyword
    const items: any[] = resp.data?.data?.items ?? [];
    const idx = items.findIndex((p: any) => String(p.sku) === sku || String(p.product_id) === sku);
    if (idx === -1) return { position: null, page: null };
    return { position: idx + 1, page: 1 };
  } catch {
    return { position: null, page: null };
  }
}

export async function checkKeywordPositions(userId: string): Promise<number> {
  const { rows: keywords } = await db.query(
    `SELECT tk.*, mc.credentials_enc, mc.platform AS conn_platform
     FROM tracked_keywords tk
     JOIN marketplace_connections mc ON mc.user_id = tk.user_id AND mc.platform = tk.platform
     WHERE tk.user_id = $1 AND tk.is_active = true AND mc.status = 'active'`,
    [userId],
  );

  let checked = 0;
  for (const kw of keywords) {
    try {
      let result = { position: null as number | null, page: null as number | null };

      if (kw.platform === 'wb') {
        result = await searchWbPosition(kw.keyword, kw.sku);
      } else if (kw.platform === 'ozon') {
        const creds = JSON.parse(decrypt(kw.credentials_enc));
        result = await searchOzonPosition(kw.keyword, kw.sku, creds);
      }

      await db.query(
        `INSERT INTO keyword_positions (user_id, keyword_id, platform, sku, keyword, position, page)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, kw.id, kw.platform, kw.sku, kw.keyword, result.position, result.page],
      );

      // Fire alert if position dropped vs previous check
      if (result.position !== null) {
        const { rows: prev } = await db.query(
          `SELECT position FROM keyword_positions WHERE keyword_id = $1 ORDER BY checked_at DESC LIMIT 1 OFFSET 1`,
          [kw.id],
        );
        if (prev.length && prev[0].position !== null) {
          const prevPos = Number(prev[0].position);
          const curPos = result.position;
          if (curPos > prevPos + 5) {
            await db.query(
              `INSERT INTO notifications (user_id, type, text, meta) VALUES ($1,'position_drop',$2,$3)`,
              [userId, `Позиция по «${kw.keyword}» упала с ${prevPos} до ${curPos}`,
               JSON.stringify({ sku: kw.sku, keyword: kw.keyword, platform: kw.platform, prev: prevPos, cur: curPos })],
            );
          }
        }
      }
      checked++;
    } catch (err: any) {
      console.error(`[seo] keyword check error: ${kw.keyword}`, err.message);
    }
    // Polite delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  return checked;
}

// ---- Listing Score ----

export function computeListingScore(product: {
  title?: string;
  description?: string;
  photoUrls?: string[];
  characteristics?: Record<string, string>;
  price?: number;
  stock?: number;
}) {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Title (0-20)
  let scoreTitle = 0;
  const titleLen = (product.title ?? '').length;
  if (titleLen === 0) {
    issues.push('Нет заголовка');
  } else if (titleLen < 30) {
    scoreTitle = 5; issues.push('Заголовок слишком короткий (меньше 30 символов)');
    suggestions.push('Добавьте ключевые слова в заголовок, оптимальная длина 60–90 символов');
  } else if (titleLen < 60) {
    scoreTitle = 12; suggestions.push('Расширьте заголовок до 60–90 символов, добавьте главный ключ');
  } else if (titleLen <= 100) {
    scoreTitle = 20;
  } else {
    scoreTitle = 15; suggestions.push('Заголовок слишком длинный, сократите до 100 символов');
  }

  // Photos (0-25)
  let scorePhotos = 0;
  const photoCount = product.photoUrls?.length ?? 0;
  if (photoCount === 0) {
    issues.push('Нет фотографий');
  } else if (photoCount < 3) {
    scorePhotos = 5; issues.push(`Мало фотографий (${photoCount}), нужно минимум 5`);
    suggestions.push('Добавьте не менее 5 фотографий с разных ракурсов + инфографику');
  } else if (photoCount < 5) {
    scorePhotos = 12; suggestions.push('Добавьте ещё фотографий (оптимум 7–10)');
  } else if (photoCount < 8) {
    scorePhotos = 20;
  } else {
    scorePhotos = 25;
  }

  // Description (0-20)
  let scoreDesc = 0;
  const descLen = (product.description ?? '').replace(/<[^>]*>/g, '').length;
  if (descLen === 0) {
    issues.push('Нет описания'); suggestions.push('Добавьте подробное описание с ключевыми словами (500–1500 символов)');
  } else if (descLen < 200) {
    scoreDesc = 5; suggestions.push('Расширьте описание до 500+ символов');
  } else if (descLen < 500) {
    scoreDesc = 12; suggestions.push('Оптимальная длина описания 500–1500 символов');
  } else if (descLen < 1500) {
    scoreDesc = 20;
  } else {
    scoreDesc = 18; suggestions.push('Описание слишком длинное, сократите до 1500 символов');
  }

  // Characteristics (0-15)
  let scoreAttrs = 0;
  const attrCount = Object.keys(product.characteristics ?? {}).length;
  if (attrCount === 0) {
    issues.push('Нет характеристик'); suggestions.push('Заполните все характеристики товара');
  } else if (attrCount < 5) {
    scoreAttrs = 5; suggestions.push('Заполните больше характеристик (минимум 10)');
  } else if (attrCount < 10) {
    scoreAttrs = 10;
  } else {
    scoreAttrs = 15;
  }

  // Price (0-5)
  let scorePrice = 0;
  if (product.price && product.price > 0) scorePrice = 5;
  else issues.push('Цена не установлена');

  // Stock (0-5) — stored in score_rating column (misc)
  let scoreStock = 0;
  if (product.stock && product.stock > 0) scoreStock = 5;
  else suggestions.push('Нет товара в наличии — добавьте остатки на склад');

  const total = scoreTitle + scorePhotos + scoreDesc + scoreAttrs + scorePrice + scoreStock;
  const label = total >= 80 ? 'excellent' : total >= 60 ? 'good' : total >= 40 ? 'average' : 'poor';

  return {
    score: total, score_label: label, issues, suggestions,
    score_title: scoreTitle, score_photos: scorePhotos, score_desc: scoreDesc,
    score_attrs: scoreAttrs, score_rating: scorePrice + scoreStock,
  };
}

export async function computeListingScores(userId: string): Promise<number> {
  const { rows: connections } = await db.query(
    `SELECT id, platform, credentials_enc FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );

  let computed = 0;
  for (const conn of connections) {
    try {
      const adapter = createAdapter(conn.platform, conn.credentials_enc);
      const products = await adapter.getProducts(200);

      for (const p of products) {
        const scored = computeListingScore(p);
        await db.query(
          `INSERT INTO listing_scores
             (user_id, connection_id, platform, sku, title, score, score_label,
              score_title, score_photos, score_desc, score_attrs, score_rating,
              issues, suggestions, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
           ON CONFLICT (connection_id, sku) DO UPDATE SET
             title=$5, score=$6, score_label=$7,
             score_title=$8, score_photos=$9, score_desc=$10, score_attrs=$11, score_rating=$12,
             issues=$13, suggestions=$14, computed_at=now()`,
          [userId, conn.id, conn.platform, p.sku, p.title,
           scored.score, scored.score_label,
           scored.score_title, scored.score_photos, scored.score_desc, scored.score_attrs, scored.score_rating,
           scored.issues, scored.suggestions],
        );
        computed++;
      }
    } catch (err: any) {
      console.error(`[seo] listing score error conn=${conn.id}:`, err.message);
    }
  }
  return computed;
}

// ---- Competitor prices ----

export async function checkCompetitorPrices(userId: string): Promise<number> {
  const { rows: tracked } = await db.query(
    `SELECT tc.*, mc.credentials_enc
     FROM tracked_competitors tc
     JOIN marketplace_connections mc ON mc.user_id = tc.user_id AND mc.platform = tc.platform AND mc.status = 'active'
     WHERE tc.user_id = $1 AND tc.is_active = true`,
    [userId],
  );

  // Also get user's own prices
  const { rows: myPrices } = await db.query(
    `SELECT sku, title, price FROM user_catalog WHERE user_id = $1`,
    [userId],
  );
  const myPriceMap: Record<string, number> = {};
  for (const r of myPrices) myPriceMap[`${r.platform}:${r.sku}`] = Number(r.price);

  let checked = 0;
  for (const comp of tracked) {
    try {
      const adapter = createAdapter(comp.platform, comp.credentials_enc);
      const product = await adapter.getProduct(comp.competitor_sku);
      const myPrice = myPriceMap[`${comp.platform}:${comp.my_sku}`] ?? null;
      const diffPct = myPrice ? ((product.price - myPrice) / myPrice) * 100 : null;

      await db.query(
        `INSERT INTO competitor_prices (user_id, platform, my_sku, competitor_sku, competitor_name, price, my_price, diff_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userId, comp.platform, comp.my_sku, comp.competitor_sku,
         comp.competitor_name ?? product.title, product.price, myPrice, diffPct],
      );

      // Alert if competitor cheaper
      if (diffPct !== null && diffPct < -5) {
        await db.query(
          `INSERT INTO notifications (user_id, type, text, meta)
           VALUES ($1,'competitor_price',$2,$3)
           ON CONFLICT DO NOTHING`,
          [userId,
           `Конкурент «${comp.competitor_name ?? product.title}» дешевле на ${Math.abs(diffPct).toFixed(0)}%`,
           JSON.stringify({ my_sku: comp.my_sku, competitor_sku: comp.competitor_sku, competitor_price: product.price, my_price: myPrice })],
        );
      }
      checked++;
    } catch (err: any) {
      console.error(`[seo] competitor price error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return checked;
}
