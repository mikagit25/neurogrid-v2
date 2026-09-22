import { db } from '../../db';

// Realistic product catalog for demo
const DEMO_SKUS = [
  { sku: '12345001', title: 'Кроссовки спортивные мужские р.42', price: 3200, purchase: 1100 },
  { sku: '12345002', title: 'Кроссовки спортивные мужские р.43', price: 3200, purchase: 1100 },
  { sku: '12345003', title: 'Кроссовки спортивные женские р.38', price: 2900, purchase: 950 },
  { sku: '12345004', title: 'Рюкзак городской 30л чёрный',       price: 2100, purchase: 680 },
  { sku: '12345005', title: 'Рюкзак городской 30л серый',         price: 2100, purchase: 680 },
  { sku: '12345006', title: 'Сумка поясная унисекс',              price: 890,  purchase: 280 },
  { sku: '12345007', title: 'Носки спортивные 5 пар р.40-42',     price: 450,  purchase: 120 },
  { sku: '12345008', title: 'Носки спортивные 5 пар р.43-45',     price: 450,  purchase: 120 },
  { sku: '12345009', title: 'Футболка беговая мужская XL',        price: 1200, purchase: 380 },
  { sku: '12345010', title: 'Футболка беговая мужская L',         price: 1200, purchase: 380 },
  { sku: '12345011', title: 'Шорты спортивные мужские M',         price: 980,  purchase: 300 },
  { sku: '12345012', title: 'Перчатки для фитнеса S/M',           price: 650,  purchase: 190 },
  { sku: '12345013', title: 'Бутылка для воды 750мл',             price: 720,  purchase: 210 },
  { sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый',    price: 1400, purchase: 420 },
  { sku: '12345015', title: 'Коврик для йоги 6мм серый',          price: 1400, purchase: 420 },
];

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rndFloat(min: number, max: number, dec = 2) {
  return +((Math.random() * (max - min) + min).toFixed(dec));
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function seedDemoAccount(userId: string, wbConnId: string, ozonConnId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // ── User catalog ──────────────────────────────────────────────────────────
    for (const item of DEMO_SKUS) {
      for (const platform of ['wb', 'ozon']) {
        await client.query(
          `INSERT INTO user_catalog (user_id, platform, sku, title, purchase_price)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [userId, platform, item.sku, item.title, item.purchase],
        );
      }
    }

    // ── Stock snapshots ───────────────────────────────────────────────────────
    const now = new Date();
    for (const item of DEMO_SKUS) {
      const connId = Math.random() > 0.5 ? wbConnId : ozonConnId;
      const platform = connId === wbConnId ? 'wb' : 'ozon';
      const fboQty = rnd(0, 280);
      const fbsQty = rnd(0, 60);

      await client.query(
        `INSERT INTO stock_snapshots (user_id, connection_id, platform, sku, title, warehouse_type, warehouse_name, quantity, snapped_at)
         VALUES ($1,$2,$3,$4,$5,'fbo','Коледино',$6,$7)`,
        [userId, connId, platform, item.sku, item.title, fboQty, now],
      );
      await client.query(
        `INSERT INTO stock_snapshots (user_id, connection_id, platform, sku, title, warehouse_type, warehouse_name, quantity, snapped_at)
         VALUES ($1,$2,$3,$4,$5,'fbs','Собственный склад',$6,$7)`,
        [userId, connId, platform, item.sku, item.title, fbsQty, now],
      );
    }

    // ── Finance records (90 days, weekly periods) ─────────────────────────────
    for (let week = 0; week < 13; week++) {
      const periodFrom = daysAgo(90 - week * 7);
      const periodTo   = daysAgo(90 - week * 7 - 7);
      for (const item of DEMO_SKUS.slice(0, 10)) {
        const qty     = rnd(5, 60);
        const revenue = +(qty * item.price * rndFloat(0.88, 1.0)).toFixed(2);
        const commission = +(revenue * rndFloat(0.11, 0.16)).toFixed(2);
        const logistics  = +(qty * rnd(60, 120)).toFixed(2);
        const penalty    = Math.random() > 0.85 ? +rndFloat(100, 800).toFixed(2) : 0;
        const netPayout  = +(revenue - commission - logistics - penalty).toFixed(2);
        const connId = item.sku.endsWith('0') || item.sku.endsWith('2') || item.sku.endsWith('4')
          ? wbConnId : ozonConnId;
        const platform = connId === wbConnId ? 'wb' : 'ozon';

        await client.query(
          `INSERT INTO finance_records
             (connection_id, user_id, platform, period_from, period_to, sku, title, quantity, revenue, commission, logistics, penalty, net_payout)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT DO NOTHING`,
          [connId, userId, platform,
           periodFrom.toISOString().slice(0, 10),
           periodTo.toISOString().slice(0, 10),
           item.sku, item.title, qty, revenue, commission, logistics, penalty, netPayout],
        );
      }
    }

    // ── Advertising records (30 days) ─────────────────────────────────────────
    for (let d = 0; d < 30; d++) {
      const date = daysAgo(d).toISOString().slice(0, 10);
      for (const item of DEMO_SKUS.slice(0, 6)) {
        const impressions = rnd(800, 12000);
        const clicks      = Math.floor(impressions * rndFloat(0.02, 0.07));
        const orders      = Math.floor(clicks * rndFloat(0.04, 0.15));
        const spend       = +(clicks * rndFloat(2.5, 8)).toFixed(2);
        const adRevenue   = +(orders * item.price * rndFloat(0.9, 1.0)).toFixed(2);

        await client.query(
          `INSERT INTO advertising_records
             (connection_id, user_id, platform, date, sku, campaign_id, campaign_name, impressions, clicks, spend, orders, ad_revenue)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [wbConnId, userId, 'wb', date, item.sku,
           `camp_${item.sku}`, `Автокампания — ${item.title.slice(0, 40)}`,
           impressions, clicks, spend, orders, adRevenue],
        );
      }
    }

    // ── Ad campaigns ──────────────────────────────────────────────────────────
    const campaignDefs = [
      { name: 'Автокампания кроссовки', type: 'auto',   status: 'running', spend: 18400, orders: 312, revenue: 145000 },
      { name: 'Поиск — рюкзаки',        type: 'search', status: 'running', spend: 9200,  orders: 148, revenue: 74000  },
      { name: 'Каталог — носки',         type: 'catalog',status: 'paused', spend: 3100,  orders: 89,  revenue: 28000  },
      { name: 'Бренд — коврики йога',    type: 'search', status: 'running', spend: 4800,  orders: 67,  revenue: 38000  },
    ];
    for (const c of campaignDefs) {
      const clicks = rnd(800, 3000);
      const impressions = clicks * rnd(20, 60);
      await client.query(
        `INSERT INTO ad_campaigns
           (connection_id, user_id, platform, external_id, name, campaign_type, status,
            budget, daily_budget, bid, impressions, clicks, spend, orders, revenue,
            ctr, drr, stats_date)
         VALUES ($1,$2,'wb',$3,$4,$5,$6, $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT DO NOTHING`,
        [wbConnId, userId, `ext_${c.name.slice(0,10).replace(/\s/g,'')}`,
         c.name, c.type, c.status,
         rnd(20000, 50000), rnd(1000, 3000), rndFloat(40, 180),
         impressions, clicks, c.spend, c.orders, c.revenue,
         +((clicks / impressions) * 100).toFixed(3),
         +((c.spend / c.revenue) * 100).toFixed(3),
         daysAgo(0).toISOString().slice(0, 10)],
      );
    }

    // ── Alert rules ───────────────────────────────────────────────────────────
    const alertRuleDefs = [
      { type: 'low_stock',       name: 'Критически низкий остаток',  threshold: 10 },
      { type: 'pnl_negative',    name: 'SKU уходит в минус по P&L',  threshold: 0  },
      { type: 'sales_drop',      name: 'Резкое падение продаж',       threshold: 30 },
      { type: 'high_returns',    name: 'Высокий процент возвратов',   threshold: 15 },
    ];
    const alertRuleIds: Record<string, string> = {};
    for (const rule of alertRuleDefs) {
      const { rows } = await client.query(
        `INSERT INTO alert_rules (user_id, type, name, threshold)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [userId, rule.type, rule.name, rule.threshold],
      );
      alertRuleIds[rule.type] = rows[0].id;
    }

    // ── Alert events ──────────────────────────────────────────────────────────
    const alertEventDefs = [
      { type: 'low_stock',    sku: '12345007', title: 'Носки спортивные 5 пар р.40-42', value: 3,  threshold: 10, msg: 'Остаток 3 шт — ниже порога 10', is_read: false, daysAgo: 1 },
      { type: 'low_stock',    sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый', value: 8,  threshold: 10, msg: 'Остаток 8 шт — ниже порога 10', is_read: true,  daysAgo: 3 },
      { type: 'sales_drop',   sku: '12345011', title: 'Шорты спортивные мужские M',     value: 45, threshold: 30, msg: 'Продажи упали на 45% за неделю', is_read: false, daysAgo: 2 },
      { type: 'high_returns', sku: '12345003', title: 'Кроссовки спортивные женские р.38', value: 18, threshold: 15, msg: 'Процент возвратов 18% превысил порог', is_read: false, daysAgo: 0 },
      { type: 'pnl_negative', sku: '12345006', title: 'Сумка поясная унисекс',           value: -120, threshold: 0, msg: 'Юнит убыточен: -120₽ чистой прибыли', is_read: true, daysAgo: 5 },
      { type: 'low_stock',    sku: '12345012', title: 'Перчатки для фитнеса S/M',        value: 6,  threshold: 10, msg: 'Остаток 6 шт — ниже порога 10', is_read: true, daysAgo: 7 },
    ];
    for (const ev of alertEventDefs) {
      await client.query(
        `INSERT INTO alert_events (user_id, rule_id, type, sku, sku_title, value, threshold, message, is_read, triggered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [userId, alertRuleIds[ev.type] || null, ev.type, ev.sku, ev.title,
         ev.value, ev.threshold, ev.msg, ev.is_read, daysAgo(ev.daysAgo)],
      );
    }

    // ── Product reviews ───────────────────────────────────────────────────────
    const reviewDefs = [
      { sku: '12345001', rating: 5, text: 'Отличные кроссовки! Бежал 10км — нога не устаёт. Рекомендую.', pros: 'Лёгкие, удобные', cons: '', answered: true  },
      { sku: '12345001', rating: 4, text: 'Хорошие кроссовки, немного жёсткие на первых порах.', pros: 'Качественные', cons: 'Требуют разноски', answered: false },
      { sku: '12345001', rating: 2, text: 'Подошва отклеилась через месяц использования', pros: '', cons: 'Плохой клей', answered: false },
      { sku: '12345004', rating: 5, text: 'Рюкзак — огонь! Влезает всё что надо, спина не болит', pros: 'Много отделений', cons: '', answered: true },
      { sku: '12345004', rating: 3, text: 'Средний рюкзак. Молния немного туговата.', pros: 'Вместительный', cons: 'Молния', answered: false },
      { sku: '12345007', rating: 5, text: 'Носки отличные! Брал уже третий раз.', pros: 'Прочные', cons: '', answered: true },
      { sku: '12345009', rating: 4, text: 'Футболка хорошая, не линяет после стирки', pros: 'Качественный материал', cons: 'Размер немного маломерит', answered: false },
      { sku: '12345014', rating: 5, text: 'Лучший коврик за эти деньги. Очень мягкий.', pros: 'Толстый, не скользит', cons: '', answered: false },
      { sku: '12345013', rating: 1, text: 'Крышка протекает, бутылка бракованная', pros: '', cons: 'Брак крышки', answered: false },
      { sku: '12345003', rating: 3, text: 'Кроссовки хорошие, но размерная сетка не соответствует', pros: 'Дизайн', cons: 'Размеры не по стандарту', answered: false },
    ];
    for (let i = 0; i < reviewDefs.length; i++) {
      const r = reviewDefs[i];
      await client.query(
        `INSERT INTO product_reviews
           (user_id, connection_id, platform, sku, external_id, author, rating, text, pros, cons, is_answered, review_date)
         VALUES ($1,$2,'wb',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [userId, wbConnId, r.sku, `ext_rev_${i + 1}`,
         `Покупатель ${1000 + i}`,
         r.rating, r.text, r.pros || null, r.cons || null,
         r.answered,
         daysAgo(rnd(1, 20)).toISOString().slice(0, 10)],
      );
    }

    // ── Price change log ──────────────────────────────────────────────────────
    const priceChanges = [
      { sku: '12345001', old: 3500, new: 3200, reason: 'AI price optimizer: конкурент снизил цену' },
      { sku: '12345004', old: 1900, new: 2100, reason: 'Ручное изменение: повышение цены' },
      { sku: '12345007', old: 490,  new: 450,  reason: 'AI price optimizer: акция WB -10%' },
      { sku: '12345009', old: 1100, new: 1200, reason: 'AI price optimizer: выросли затраты' },
      { sku: '12345014', old: 1600, new: 1400, reason: 'Конкурент снизил до 1380, корректируем' },
      { sku: '12345001', old: 3200, new: 3400, reason: 'Рост спроса — тестируем повышение' },
    ];
    for (let i = 0; i < priceChanges.length; i++) {
      const pc = priceChanges[i];
      const item = DEMO_SKUS.find(s => s.sku === pc.sku)!;
      await client.query(
        `INSERT INTO price_change_log (user_id, connection_id, platform, sku, title, old_price, new_price, reason, applied_at)
         VALUES ($1,$2,'wb',$3,$4,$5,$6,$7,$8)`,
        [userId, wbConnId, pc.sku, item.title, pc.old, pc.new, pc.reason, daysAgo(rnd(1, 14))],
      );
    }

    // ── Scenario runs ─────────────────────────────────────────────────────────
    const { rows: scenarios } = await client.query(
      `SELECT id, slug FROM scenarios WHERE slug IN ('review-drafts','card-generator','price-monitor','seo-audit') LIMIT 10`,
    );
    for (const sc of scenarios) {
      for (let i = 0; i < rnd(3, 8); i++) {
        const status = Math.random() > 0.15 ? 'success' : 'error';
        await client.query(
          `INSERT INTO scenario_runs (user_id, scenario_id, input_data, status, result, cost, started_at, finished_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [userId, sc.id,
           JSON.stringify({ sku: DEMO_SKUS[rnd(0, DEMO_SKUS.length - 1)].sku }),
           status,
           status === 'success' ? JSON.stringify({ ok: true, generated: true }) : null,
           rndFloat(1.5, 8.5),
           daysAgo(rnd(1, 30)),
           daysAgo(rnd(0, 30)),
           daysAgo(rnd(1, 30))],
        );
      }
    }

    // ── Restock forecasts ─────────────────────────────────────────────────────
    const restockItems = [
      { sku: '12345007', title: 'Носки спортивные 5 пар р.40-42', stock: 3,   sales: 4.2, status: 'critical' },
      { sku: '12345012', title: 'Перчатки для фитнеса S/M',        stock: 6,   sales: 2.8, status: 'critical' },
      { sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый', stock: 12,  sales: 1.8, status: 'warning'  },
      { sku: '12345011', title: 'Шорты спортивные мужские M',      stock: 18,  sales: 2.1, status: 'warning'  },
      { sku: '12345001', title: 'Кроссовки спортивные мужские р.42', stock: 85, sales: 3.4, status: 'ok' },
      { sku: '12345004', title: 'Рюкзак городской 30л чёрный',     stock: 142, sales: 2.0, status: 'ok' },
    ];
    for (const rf of restockItems) {
      const daysLeft = rf.sales > 0 ? Math.floor(rf.stock / rf.sales) : 999;
      await client.query(
        `INSERT INTO restock_forecasts
           (user_id, connection_id, platform, sku, title, current_stock, avg_daily_sales, days_left, reorder_point, reorder_qty, status)
         VALUES ($1,$2,'wb',$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (connection_id, sku) DO UPDATE
           SET current_stock=$5, avg_daily_sales=$6, days_left=$7, status=$10, computed_at=now()`,
        [userId, wbConnId, rf.sku, rf.title, rf.stock, rf.sales, daysLeft,
         Math.ceil(rf.sales * 14), Math.ceil(rf.sales * 30), rf.status],
      );
    }

    // ── Subscription ─────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO subscriptions (user_id, plan, expires_at)
       VALUES ($1, 'business', now() + interval '2 hours')
       ON CONFLICT (user_id) DO UPDATE SET plan='business', expires_at=now() + interval '2 hours', updated_at=now()`,
      [userId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
