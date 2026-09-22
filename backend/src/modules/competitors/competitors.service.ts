import axios from 'axios';
import { db } from '../../db';

export interface ScrapedProduct {
  name: string;
  brand: string;
  price: number;
  rating: number;
  reviews_count: number;
}

export async function scrapeWbProduct(externalId: string): Promise<ScrapedProduct | null> {
  try {
    const resp = await axios.get(
      `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${externalId}`,
      {
        timeout: 10_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.wildberries.ru/',
        },
      }
    );
    const product = resp.data?.data?.products?.[0];
    if (!product) return null;
    const size0 = product.sizes?.[0] ?? {};
    const priceU: number = size0.price?.total ?? product.priceU ?? 0;
    return {
      name: product.name ?? '',
      brand: product.brand ?? '',
      price: Math.round(priceU / 100),
      rating: product.reviewRating ?? product.rating ?? 0,
      reviews_count: product.feedbacks ?? 0,
    };
  } catch {
    return null;
  }
}

export async function scrapeOzonProduct(externalId: string): Promise<ScrapedProduct | null> {
  try {
    const resp = await axios.get(
      `https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=/product/${externalId}/`,
      {
        timeout: 10_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'x-o3-app-name': 'ozonapp_android',
          'x-o3-app-version': '17.28.0',
        },
      }
    );
    const widget = resp.data?.widgetStates;
    if (!widget) return null;
    const webPrice = Object.entries(widget).find(([k]) => k.startsWith('webPrice-'));
    const webProduct = Object.entries(widget).find(([k]) => k.startsWith('webProductHeading-'));
    if (!webPrice) return null;
    const priceData = JSON.parse((webPrice[1] as string));
    const productData = webProduct ? JSON.parse((webProduct[1] as string)) : {};
    const priceStr = priceData?.price?.replace(/[^\d]/g, '') ?? '0';
    return {
      name: productData?.title ?? '',
      brand: productData?.brandName ?? '',
      price: parseInt(priceStr, 10) || 0,
      rating: productData?.rating ?? 0,
      reviews_count: productData?.reviewsCount ?? 0,
    };
  } catch {
    return null;
  }
}

export async function scrapeProduct(platform: string, externalId: string): Promise<ScrapedProduct | null> {
  return platform === 'wb' ? scrapeWbProduct(externalId) : scrapeOzonProduct(externalId);
}

export async function addCompetitor(userId: string, platform: string, externalId: string, opts: {
  our_sku?: string; alert_pct?: number;
}) {
  // Scrape immediately to get name/price
  const scraped = await scrapeProduct(platform, externalId);

  const { rows } = await db.query(
    `INSERT INTO competitor_skus (user_id, platform, external_id, name, brand, our_sku, alert_pct, last_price, last_scraped_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (user_id, platform, external_id)
       DO UPDATE SET is_active = true, last_price = EXCLUDED.last_price,
                     last_scraped_at = now(), name = COALESCE(EXCLUDED.name, competitor_skus.name)
     RETURNING *`,
    [userId, platform, externalId,
     scraped?.name ?? null, scraped?.brand ?? null,
     opts.our_sku ?? null, opts.alert_pct ?? 5,
     scraped?.price ?? null],
  );
  const row = rows[0];

  if (scraped?.price) {
    await db.query(
      `INSERT INTO competitor_price_history (competitor_sku_id, price, rating, reviews_count)
       VALUES ($1,$2,$3,$4)`,
      [row.id, scraped.price, scraped.rating, scraped.reviews_count],
    );
  }

  return row;
}

export async function getCompetitorsWithHistory(userId: string) {
  const { rows } = await db.query(
    `SELECT cs.*,
       COALESCE(
         json_agg(
           json_build_object('price', cph.price, 'scraped_at', cph.scraped_at, 'rating', cph.rating, 'reviews_count', cph.reviews_count)
           ORDER BY cph.scraped_at DESC
         ) FILTER (WHERE cph.id IS NOT NULL),
         '[]'
       ) AS history
     FROM competitor_skus cs
     LEFT JOIN competitor_price_history cph
       ON cph.competitor_sku_id = cs.id
      AND cph.scraped_at >= now() - interval '30 days'
     WHERE cs.user_id = $1 AND cs.is_active = true
     GROUP BY cs.id
     ORDER BY cs.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function scrapeAllActive(userId?: string) {
  const query = userId
    ? `SELECT * FROM competitor_skus WHERE user_id = $1 AND is_active = true`
    : `SELECT * FROM competitor_skus WHERE is_active = true`;
  const params = userId ? [userId] : [];
  const { rows } = await db.query(query, params);

  let updated = 0;
  for (const row of rows) {
    const scraped = await scrapeProduct(row.platform, row.external_id);
    if (!scraped) continue;
    await db.query(
      `UPDATE competitor_skus SET last_price = $1, last_scraped_at = now() WHERE id = $2`,
      [scraped.price, row.id],
    );
    await db.query(
      `INSERT INTO competitor_price_history (competitor_sku_id, price, rating, reviews_count)
       VALUES ($1,$2,$3,$4)`,
      [row.id, scraped.price, scraped.rating, scraped.reviews_count],
    );
    updated++;
  }
  return updated;
}
