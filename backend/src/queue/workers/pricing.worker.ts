import { db } from '../../db';
import { createAdapter } from '../../integrations/marketplace/factory';

interface RuleRow {
  id: string;
  user_id: string;
  connection_id: string;
  platform: string;
  credentials_enc: string;
  sku: string | null;
  name: string;
  strategy: string;
  config: Record<string, any>;
}

function computePrice(
  strategy: string,
  config: Record<string, any>,
  currentPrice: number,
  costPrice: number | null,
  isWeekend: boolean,
  competitorPrice?: number | null,
): number | null {
  const min = config.minPrice ? Number(config.minPrice) : 0;
  const max = config.maxPrice ? Number(config.maxPrice) : Infinity;
  const clamp = (p: number) => Math.max(min || 1, Math.min(max, Math.round(p)));

  switch (strategy) {
    case 'fixed': {
      const fp = Number(config.fixedPrice);
      return fp > 0 ? clamp(fp) : null;
    }
    case 'margin': {
      const base = costPrice ?? currentPrice;
      const margin = Number(config.margin ?? 30) / 100;
      return base > 0 ? clamp(base * (1 + margin)) : null;
    }
    case 'competitive': {
      const discount = Number(config.discount ?? 5) / 100;
      return currentPrice > 0 ? clamp(currentPrice * (1 - discount)) : null;
    }
    case 'dynamic': {
      const mult = isWeekend ? Number(config.weekendMultiplier ?? 1.1) : 1;
      return currentPrice > 0 ? clamp(currentPrice * mult) : null;
    }
    case 'competitor_based': {
      if (!competitorPrice) return null;
      const mode = config.competitorMode ?? 'match'; // match | undercut | above
      const pct = Number(config.competitorPct ?? 0) / 100;
      let target: number;
      if (mode === 'undercut') target = competitorPrice * (1 - pct);
      else if (mode === 'above') target = competitorPrice * (1 + pct);
      else target = competitorPrice; // match
      return clamp(target);
    }
    default:
      return null;
  }
}

export async function applyPricingRule(ruleId: string, userId: string): Promise<{ applied: number; skipped: number }> {
  const { rows } = await db.query<RuleRow>(
    `SELECT pr.id, pr.user_id, pr.connection_id, pr.sku, pr.name, pr.strategy, pr.config,
            mc.platform, mc.credentials_enc
     FROM pricing_rules pr
     JOIN marketplace_connections mc ON mc.id = pr.connection_id
     WHERE pr.id = $1 AND pr.user_id = $2 AND pr.enabled = true`,
    [ruleId, userId],
  );
  if (!rows.length) return { applied: 0, skipped: 0 };
  return _applyRule(rows[0]);
}

async function _applyRule(rule: RuleRow): Promise<{ applied: number; skipped: number }> {
  const adapter = createAdapter(rule.platform, rule.credentials_enc);
  const products = await adapter.getProducts(200);
  const targets = rule.sku ? products.filter((p) => p.sku === rule.sku) : products;

  // Pre-load competitor price map for competitor_based strategy
  let competitorPriceMap: Record<string, number> = {};
  if (rule.strategy === 'competitor_based') {
    const { rows: compRows } = await db.query<{ my_sku: string; price: number }>(
      `SELECT DISTINCT ON (my_sku) my_sku, price
       FROM competitor_prices
       WHERE user_id = $1 AND platform = $2
       ORDER BY my_sku, checked_at DESC`,
      [rule.user_id, rule.platform],
    );
    for (const r of compRows) competitorPriceMap[r.my_sku] = Number(r.price);
  }

  const isWeekend = [0, 6].includes(new Date().getDay());
  let applied = 0;
  let skipped = 0;

  for (const p of targets) {
    try {
      // Look up purchase price from user_catalog
      const { rows: catalogRows } = await db.query<{ purchase_price: string | null }>(
        `SELECT purchase_price FROM user_catalog WHERE user_id = $1 AND platform = $2 AND sku = $3`,
        [rule.user_id, rule.platform, p.sku],
      );
      const costPrice = catalogRows[0]?.purchase_price ? Number(catalogRows[0].purchase_price) : null;
      const competitorPrice = competitorPriceMap[p.sku] ?? null;

      const newPrice = computePrice(rule.strategy, rule.config, p.price, costPrice, isWeekend, competitorPrice);
      if (newPrice === null || newPrice === p.price) { skipped++; continue; }

      await adapter.updatePrice(p.sku, newPrice);

      await db.query(
        `INSERT INTO price_change_log (user_id, rule_id, connection_id, platform, sku, title, old_price, new_price, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [rule.user_id, rule.id, rule.connection_id, rule.platform, p.sku, p.title, p.price, newPrice, rule.name],
      );
      applied++;
    } catch (err) {
      console.error(`[pricing] sku=${p.sku} rule=${rule.id}:`, (err as Error).message);
      skipped++;
    }
  }

  await db.query(
    `UPDATE pricing_rules SET last_applied_at = now() WHERE id = $1`,
    [rule.id],
  );

  console.log(`[pricing] rule="${rule.name}" applied=${applied} skipped=${skipped}`);
  return { applied, skipped };
}

export async function runPricingWorker(): Promise<void> {
  const { rows: rules } = await db.query<RuleRow>(
    `SELECT pr.id, pr.user_id, pr.connection_id, pr.sku, pr.name, pr.strategy, pr.config,
            mc.platform, mc.credentials_enc
     FROM pricing_rules pr
     JOIN marketplace_connections mc ON mc.id = pr.connection_id AND mc.status = 'active'
     WHERE pr.enabled = true`,
  );

  console.log(`[pricing] applying ${rules.length} enabled rules`);
  for (const rule of rules) {
    try { await _applyRule(rule); } catch (err) {
      console.error(`[pricing] rule=${rule.id} failed:`, (err as Error).message);
    }
  }
}
