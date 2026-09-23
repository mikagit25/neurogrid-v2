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

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
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
      { name: 'Автокампания кроссовки', type: 'auto',    status: 'running', spend: 18400, orders: 312, revenue: 145000 },
      { name: 'Поиск — рюкзаки',        type: 'search',  status: 'running', spend: 9200,  orders: 148, revenue: 74000  },
      { name: 'Каталог — носки',         type: 'catalog', status: 'paused',  spend: 3100,  orders: 89,  revenue: 28000  },
      { name: 'Бренд — коврики йога',    type: 'search',  status: 'running', spend: 4800,  orders: 67,  revenue: 38000  },
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
      { type: 'low_stock',    name: 'Критически низкий остаток', threshold: 10 },
      { type: 'pnl_negative', name: 'SKU уходит в минус по P&L', threshold: 0  },
      { type: 'sales_drop',   name: 'Резкое падение продаж',      threshold: 30 },
      { type: 'high_returns', name: 'Высокий процент возвратов',  threshold: 15 },
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
      { type: 'low_stock',    sku: '12345007', title: 'Носки спортивные 5 пар р.40-42',     value: 3,    threshold: 10, msg: 'Остаток 3 шт — ниже порога 10',               is_read: false, daysAgo: 1 },
      { type: 'low_stock',    sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый',     value: 8,    threshold: 10, msg: 'Остаток 8 шт — ниже порога 10',               is_read: true,  daysAgo: 3 },
      { type: 'sales_drop',   sku: '12345011', title: 'Шорты спортивные мужские M',          value: 45,   threshold: 30, msg: 'Продажи упали на 45% за неделю',              is_read: false, daysAgo: 2 },
      { type: 'high_returns', sku: '12345003', title: 'Кроссовки спортивные женские р.38',   value: 18,   threshold: 15, msg: 'Процент возвратов 18% превысил порог',        is_read: false, daysAgo: 0 },
      { type: 'pnl_negative', sku: '12345006', title: 'Сумка поясная унисекс',               value: -120, threshold: 0,  msg: 'Юнит убыточен: -120₽ чистой прибыли',        is_read: true,  daysAgo: 5 },
      { type: 'low_stock',    sku: '12345012', title: 'Перчатки для фитнеса S/M',            value: 6,    threshold: 10, msg: 'Остаток 6 шт — ниже порога 10',               is_read: true,  daysAgo: 7 },
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
      `SELECT id, slug FROM scenarios WHERE slug IN ('review-drafts','card-generator','price-monitor','seo-audit','niche-analysis','stock-forecast') LIMIT 10`,
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
      { sku: '12345007', title: 'Носки спортивные 5 пар р.40-42',   stock: 3,   sales: 4.2, status: 'critical' },
      { sku: '12345012', title: 'Перчатки для фитнеса S/M',          stock: 6,   sales: 2.8, status: 'critical' },
      { sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый',   stock: 12,  sales: 1.8, status: 'warning'  },
      { sku: '12345011', title: 'Шорты спортивные мужские M',        stock: 18,  sales: 2.1, status: 'warning'  },
      { sku: '12345001', title: 'Кроссовки спортивные мужские р.42', stock: 85,  sales: 3.4, status: 'ok'       },
      { sku: '12345004', title: 'Рюкзак городской 30л чёрный',       stock: 142, sales: 2.0, status: 'ok'       },
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

    // ── Purchase orders (поставки) ────────────────────────────────────────────
    const poItems = [
      { sku: '12345007', title: 'Носки спортивные 5 пар р.40-42',   qty: 200, cost: 120, status: 'ordered',   supplier: 'ООО Текстиль Плюс',   daysExpected: 5  },
      { sku: '12345012', title: 'Перчатки для фитнеса S/M',          qty: 80,  cost: 190, status: 'ordered',   supplier: 'Спорт Трейд',         daysExpected: 7  },
      { sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый',   qty: 50,  cost: 420, status: 'planned',   supplier: 'SportGoods LLC',      daysExpected: 14 },
      { sku: '12345001', title: 'Кроссовки спортивные мужские р.42', qty: 100, cost: 1100, status: 'received', supplier: 'Фабрика "Атлет"',     daysExpected: -5 },
      { sku: '12345004', title: 'Рюкзак городской 30л чёрный',       qty: 60,  cost: 680, status: 'received',  supplier: 'Сумки Опт ИП Иванов', daysExpected: -3 },
      { sku: '12345009', title: 'Футболка беговая мужская XL',        qty: 120, cost: 380, status: 'in_transit',supplier: 'ООО Текстиль Плюс',  daysExpected: 2  },
    ];
    for (const po of poItems) {
      const expectedDate = daysFromNow(po.daysExpected).toISOString().slice(0, 10);
      const receivedDate = po.status === 'received' ? daysAgo(Math.abs(po.daysExpected)).toISOString().slice(0, 10) : null;
      await client.query(
        `INSERT INTO purchase_orders (user_id, platform, sku, title, qty, unit_cost, total_cost, status, supplier, expected_at, received_at)
         VALUES ($1,'wb',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [userId, po.sku, po.title, po.qty, po.cost, +(po.qty * po.cost).toFixed(2),
         po.status, po.supplier, expectedDate, receivedDate],
      );
    }

    // ── Suppliers (поставщики) ────────────────────────────────────────────────
    const supplierDefs = [
      { name: 'ООО Текстиль Плюс',      contact: 'Сергей Морозов',  email: 'info@textileplus.ru', phone: '+7 495 123-45-67', lead_time: 7,  min_qty: 50,  terms: 'Оплата 50% предоплата, 50% при отгрузке' },
      { name: 'Фабрика "Атлет"',         contact: 'Анна Петрова',    email: 'sales@athlet-factory.ru', phone: '+7 812 987-65-43', lead_time: 14, min_qty: 100, terms: 'Оплата по факту' },
      { name: 'Спорт Трейд',             contact: 'Дмитрий Ковалёв', email: 'kovdev@sporttrade.com', phone: '+7 999 111-22-33', lead_time: 5,  min_qty: 20,  terms: '100% предоплата' },
      { name: 'SportGoods LLC',          contact: 'Liu Wei',         email: 'liuwei@sgll.com',        phone: '+86 138-0000-1234', lead_time: 21, min_qty: 200, terms: 'T/T 30 days' },
      { name: 'Сумки Опт ИП Иванов',    contact: 'Виктор Иванов',   email: 'bags@ivanov.biz',        phone: '+7 903 444-55-66', lead_time: 4,  min_qty: 30,  terms: 'Оплата на счёт' },
    ];
    for (const s of supplierDefs) {
      await client.query(
        `INSERT INTO suppliers (user_id, name, contact_name, email, phone, lead_time_days, min_order_qty, payment_terms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userId, s.name, s.contact, s.email, s.phone, s.lead_time, s.min_qty, s.terms],
      );
    }

    // ── Return items & analytics ──────────────────────────────────────────────
    const returnDefs = [
      { sku: '12345003', title: 'Кроссовки спортивные женские р.38',   reason: 'Не подошёл размер',      code: 'wrong_size',  refund: 2900, status: 'refunded' },
      { sku: '12345001', title: 'Кроссовки спортивные мужские р.42',   reason: 'Не подошёл размер',      code: 'wrong_size',  refund: 3200, status: 'refunded' },
      { sku: '12345013', title: 'Бутылка для воды 750мл',              reason: 'Брак: протекает крышка', code: 'defect',      refund: 720,  status: 'approved' },
      { sku: '12345009', title: 'Футболка беговая мужская XL',          reason: 'Не подошёл размер',      code: 'wrong_size',  refund: 1200, status: 'refunded' },
      { sku: '12345004', title: 'Рюкзак городской 30л чёрный',          reason: 'Изменилось решение',     code: 'changed_mind', refund: 2100, status: 'pending'  },
      { sku: '12345014', title: 'Коврик для йоги 6мм фиолетовый',      reason: 'Цвет отличается от фото', code: 'wrong_color', refund: 1400, status: 'pending'  },
      { sku: '12345001', title: 'Кроссовки спортивные мужские р.42',   reason: 'Качество не понравилось', code: 'quality',     refund: 3200, status: 'refunded' },
    ];
    for (let i = 0; i < returnDefs.length; i++) {
      const r = returnDefs[i];
      await client.query(
        `INSERT INTO return_items (user_id, connection_id, platform, sku, title, order_id, return_id, qty, reason, reason_code, status, refund_amount, return_date)
         VALUES ($1,$2,'wb',$3,$4,$5,$6,1,$7,$8,$9,$10,$11)`,
        [userId, wbConnId, r.sku, r.title,
         `ORD-${100000 + i}`, `RET-${200000 + i}`,
         r.reason, r.code, r.status, r.refund,
         daysAgo(rnd(1, 15)).toISOString().slice(0, 10)],
      );
    }
    // Return analytics per SKU
    const returnAnalytics = [
      { sku: '12345003', orders: 42, returns: 8,  rate: 19.0, reason: 'Не подошёл размер' },
      { sku: '12345001', orders: 87, returns: 12, rate: 13.8, reason: 'Не подошёл размер' },
      { sku: '12345013', orders: 31, returns: 5,  rate: 16.1, reason: 'Брак: протекает крышка' },
      { sku: '12345009', orders: 56, returns: 7,  rate: 12.5, reason: 'Не подошёл размер' },
      { sku: '12345004', orders: 64, returns: 4,  rate: 6.3,  reason: 'Изменилось решение' },
    ];
    for (const ra of returnAnalytics) {
      await client.query(
        `INSERT INTO return_analytics (user_id, platform, sku, period_start, period_end, total_orders, total_returns, return_rate, top_reason)
         VALUES ($1,'wb',$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [userId, ra.sku,
         daysAgo(30).toISOString().slice(0, 10),
         daysAgo(0).toISOString().slice(0, 10),
         ra.orders, ra.returns, ra.rate, ra.reason],
      );
    }

    // ── Competitor prices ─────────────────────────────────────────────────────
    const competitorData = [
      { mySku: '12345001', compSku: 'C001', compName: 'SportMax Pro',     compPrice: 3050, myPrice: 3200 },
      { mySku: '12345001', compSku: 'C002', compName: 'RunFast Store',    compPrice: 3400, myPrice: 3200 },
      { mySku: '12345004', compSku: 'C003', compName: 'BagWorld',         compPrice: 1980, myPrice: 2100 },
      { mySku: '12345004', compSku: 'C004', compName: 'UrbanGear',        compPrice: 2250, myPrice: 2100 },
      { mySku: '12345014', compSku: 'C005', compName: 'YogaLife Shop',    compPrice: 1350, myPrice: 1400 },
      { mySku: '12345007', compSku: 'C006', compName: 'СпортОптТорг',     compPrice: 420,  myPrice: 450  },
      { mySku: '12345009', compSku: 'C007', compName: 'TextileRun',       compPrice: 1150, myPrice: 1200 },
    ];
    for (const c of competitorData) {
      const diffPct = +(((c.myPrice - c.compPrice) / c.compPrice) * 100).toFixed(2);
      await client.query(
        `INSERT INTO tracked_competitors (user_id, platform, my_sku, competitor_sku, competitor_name)
         VALUES ($1,'wb',$2,$3,$4) ON CONFLICT DO NOTHING`,
        [userId, c.mySku, c.compSku, c.compName],
      );
      await client.query(
        `INSERT INTO competitor_prices (user_id, platform, my_sku, competitor_sku, competitor_name, price, my_price, diff_pct)
         VALUES ($1,'wb',$2,$3,$4,$5,$6,$7)`,
        [userId, c.mySku, c.compSku, c.compName, c.compPrice, c.myPrice, diffPct],
      );
    }

    // ── Pricing rules (автопилот цен) ─────────────────────────────────────────
    const pricingRuleDefs = [
      { name: 'Защита маржи — кроссовки', sku: '12345001', strategy: 'margin', config: { min_margin_pct: 20, max_discount_pct: 15 }, enabled: true  },
      { name: 'Следить за конкурентами',   sku: null,       strategy: 'competitor', config: { target: 'beat', offset_pct: -2, check_interval: 'hourly' }, enabled: true  },
      { name: 'Акция выходного дня',       sku: null,       strategy: 'promo', config: { discount_pct: 10, days: ['Saturday', 'Sunday'] }, enabled: false },
    ];
    for (const pr of pricingRuleDefs) {
      await client.query(
        `INSERT INTO pricing_rules (user_id, connection_id, sku, name, strategy, config, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, wbConnId, pr.sku, pr.name, pr.strategy, JSON.stringify(pr.config), pr.enabled],
      );
    }

    // ── User automations ──────────────────────────────────────────────────────
    const automationDefs = [
      { slug: 'review-drafts',  schedule: 'daily',  auto_apply: true,  enabled: true,  settings: { min_rating: 1, max_rating: 3 } },
      { slug: 'price-monitor',  schedule: 'hourly', auto_apply: false, enabled: true,  settings: { threshold_pct: 5 } },
      { slug: 'seo-audit',      schedule: 'weekly', auto_apply: false, enabled: false, settings: {} },
    ];
    for (const au of automationDefs) {
      await client.query(
        `INSERT INTO user_automations (user_id, scenario_slug, connection_id, enabled, schedule, auto_apply, settings, last_run_at, last_run_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [userId, au.slug, wbConnId, au.enabled, au.schedule, au.auto_apply,
         JSON.stringify(au.settings),
         au.enabled ? daysAgo(rnd(0, 2)) : null,
         au.enabled ? 'success' : null],
      );
    }

    // ── Promo events (акции) ──────────────────────────────────────────────────
    await client.query(
      `INSERT INTO promo_events (user_id, name, platform, skus, starts_at, ends_at, discount_pct, promo_type, notes)
       VALUES ($1,'Распродажа "Осень 2026"','wb', $2, $3, $4, 15, 'sale', 'Сезонная акция, участвуют все кроссовки и рюкзаки')`,
      [userId,
       ['12345001','12345002','12345003','12345004','12345005'],
       daysAgo(3).toISOString().slice(0, 10),
       daysFromNow(4).toISOString().slice(0, 10)],
    );
    await client.query(
      `INSERT INTO promo_events (user_id, name, platform, skus, starts_at, ends_at, discount_pct, promo_type, notes)
       VALUES ($1,'Акция WB 11.11','wb', $2, $3, $4, 20, 'wb_promo', 'Глобальная акция маркетплейса, все товары')`,
      [userId,
       DEMO_SKUS.map(s => s.sku),
       daysFromNow(7).toISOString().slice(0, 10),
       daysFromNow(14).toISOString().slice(0, 10)],
    );

    // ── Weekly AI-reports ─────────────────────────────────────────────────────
    const reportInsights = [
      { icon: '📈', text: 'Кроссовки мужские р.42 показали рост продаж +34% по сравнению с прошлой неделей. Рекомендуем увеличить рекламный бюджет.' },
      { icon: '⚠️', text: 'Остатки носков (SKU 12345007) критически низкие — 3 шт. При текущей скорости продаж 4.2 шт/день закончатся через 0.7 дня.' },
      { icon: '💰', text: 'Сумка поясная унисекс убыточна: юнит-экономика -120₽. После учёта комиссий и логистики продавать её на WB нерентабельно.' },
      { icon: '🎯', text: 'CTR рекламной кампании "Автокампания кроссовки" составил 3.8% — выше среднего по категории (2.1%). ДРР = 12.7%.' },
      { icon: '🔄', text: 'Процент возвратов по кроссовкам женским р.38 достиг 19% — основная причина: несоответствие размерной сетки. Рекомендуем добавить размерную таблицу в карточку.' },
    ];
    await client.query(
      `INSERT INTO weekly_reports (user_id, period_start, period_end, headline, summary, insights, kpis)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId,
       daysAgo(14).toISOString().slice(0, 10),
       daysAgo(7).toISOString().slice(0, 10),
       'Неделя 38: рост выручки +18%, критический дефицит 2 SKU',
       'За прошедшую неделю выручка выросла на 18% относительно предыдущего периода. Лидеры продаж — кроссовки и рюкзаки. Выявлены 2 товара с критическим остатком и 1 убыточный SKU. Рекомендуется срочно пополнить склад по носкам и перчаткам.',
       JSON.stringify(reportInsights),
       JSON.stringify({ revenue: 284500, orders: 312, avg_check: 912, margin_pct: 28.4, drr_pct: 12.7, returns_pct: 11.2 })],
    );
    const reportInsights2 = [
      { icon: '📦', text: 'SEO-аудит карточек выявил слабые описания у 6 из 15 SKU. Средний score — 61/100. После доработки ожидается рост трафика на 25-35%.' },
      { icon: '🏆', text: 'Рюкзак городской 30л чёрный занял 3-е место в категории по продажам. Конкурент BagWorld снизил цену до 1980₽ — рекомендуем не снижать цену ниже 2050₽.' },
      { icon: '💡', text: 'AI-анализ отзывов: 73% негативных связаны с несоответствием размеров. Рекомендуется добавить размерную таблицу во все карточки обуви.' },
    ];
    await client.query(
      `INSERT INTO weekly_reports (user_id, period_start, period_end, headline, summary, insights, kpis)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId,
       daysAgo(7).toISOString().slice(0, 10),
       daysAgo(0).toISOString().slice(0, 10),
       'Неделя 39: SEO-аудит завершён, рюкзаки в топ-3 категории',
       'Текущая неделя: завершён SEO-аудит товарных карточек, обнаружены зоны роста. Рюкзаки вошли в топ-3 категории. Реклама принесла 31% всех заказов при ДРР 12.7%. AI-анализ отзывов указывает на системную проблему с размерными сетками.',
       JSON.stringify(reportInsights2),
       JSON.stringify({ revenue: 241000, orders: 268, avg_check: 899, margin_pct: 26.1, drr_pct: 13.4, returns_pct: 12.8 })],
    );

    // ── Notifications ─────────────────────────────────────────────────────────
    const notifDefs = [
      { type: 'alert',      text: '🔴 Критический остаток: Носки спортивные 5 пар р.40-42 — 3 шт. Срочно пополните склад.',           is_read: false },
      { type: 'alert',      text: '⚠️ Падение продаж: Шорты спортивные мужские M — минус 45% за неделю.',                            is_read: false },
      { type: 'alert',      text: '🔄 Высокий возврат: Кроссовки женские р.38 — 18% возвратов (порог: 15%).',                         is_read: false },
      { type: 'ai',         text: '🤖 AI-отчёт за неделю 39 готов: выручка ₽241 000, маржа 26.1%. Открыть отчёт →',                  is_read: false },
      { type: 'ai',         text: '🤖 Автопилот цен: скорректированы цены на 4 SKU. Средний рост маржи +2.3%.',                       is_read: true  },
      { type: 'scenario',   text: '✅ Сценарий "Ответы на отзывы" завершён — сформировано 3 ответа для модерации.',                    is_read: true  },
      { type: 'scenario',   text: '✅ Сценарий "SEO-аудит карточки" завершён — score 71/100, найдено 5 улучшений.',                    is_read: true  },
      { type: 'promo',      text: '📢 Акция "Распродажа Осень 2026" стартовала. Участвуют 5 SKU со скидкой 15%.',                     is_read: true  },
      { type: 'competitor', text: '💰 Конкурент BagWorld снизил цену на рюкзак до 1980₽. Ваша цена: 2100₽ (+6.1%). Проверить →',     is_read: false },
      { type: 'system',     text: '✅ Синхронизация остатков завершена. Обновлено 30 позиций по 2 магазинам.',                         is_read: true  },
    ];
    for (let i = 0; i < notifDefs.length; i++) {
      await client.query(
        `INSERT INTO notifications (user_id, type, text, is_read, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, notifDefs[i].type, notifDefs[i].text, notifDefs[i].is_read, daysAgo(i * 0.3)],
      );
    }

    // ── Transactions (история баланса) ────────────────────────────────────────
    const txDefs = [
      { type: 'topup',  amount: 5000 },
      { type: 'charge', amount: -7.9  },
      { type: 'charge', amount: -9.9  },
      { type: 'charge', amount: -12.9 },
      { type: 'charge', amount: -9.9  },
      { type: 'topup',  amount: 1000 },
      { type: 'charge', amount: -150  },
    ];
    for (let i = 0; i < txDefs.length; i++) {
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, created_at)
         VALUES ($1,$2,$3,$4)`,
        [userId, txDefs[i].type, txDefs[i].amount, daysAgo(txDefs.length - i)],
      );
    }

    // ── Listing scores (SEO карточек) ─────────────────────────────────────────
    const listingScoreDefs = [
      { sku: '12345001', score: 82, label: 'good',    title: 85, photos: 90, desc: 75, attrs: 80, rating: 84, reviews: 78 },
      { sku: '12345004', score: 91, label: 'great',   title: 95, photos: 95, desc: 88, attrs: 90, rating: 92, reviews: 85 },
      { sku: '12345007', score: 63, label: 'average', title: 70, photos: 55, desc: 60, attrs: 65, rating: 72, reviews: 55 },
      { sku: '12345009', score: 74, label: 'good',    title: 78, photos: 80, desc: 68, attrs: 72, rating: 78, reviews: 68 },
      { sku: '12345014', score: 88, label: 'great',   title: 92, photos: 90, desc: 85, attrs: 88, rating: 85, reviews: 88 },
      { sku: '12345013', score: 45, label: 'poor',    title: 50, photos: 40, desc: 42, attrs: 48, rating: 45, reviews: 45 },
      { sku: '12345003', score: 57, label: 'average', title: 60, photos: 65, desc: 50, attrs: 55, rating: 60, reviews: 50 },
    ];
    for (const ls of listingScoreDefs) {
      const issues: string[] = [];
      if (ls.photos < 70) issues.push('Мало фотографий');
      if (ls.desc < 65) issues.push('Короткое описание');
      if (ls.attrs < 70) issues.push('Не заполнены атрибуты');
      if (ls.reviews < 60) issues.push('Мало отзывов');
      await client.query(
        `INSERT INTO listing_scores (user_id, connection_id, platform, sku, title, score, score_label, score_title, score_photos, score_desc, score_attrs, score_rating, score_reviews, issues)
         VALUES ($1,$2,'wb',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT DO NOTHING`,
        [userId, wbConnId, ls.sku,
         DEMO_SKUS.find(s => s.sku === ls.sku)!.title,
         ls.score, ls.label, ls.title, ls.photos, ls.desc, ls.attrs, ls.rating, ls.reviews,
         issues],
      );
    }

    // ── Tracked keywords ──────────────────────────────────────────────────────
    const keywordDefs = [
      { sku: '12345001', keywords: ['кроссовки мужские', 'кроссовки спортивные 42', 'беговые кроссовки мужские', 'кроссовки для бега'] },
      { sku: '12345004', keywords: ['рюкзак городской', 'рюкзак 30 литров', 'городской рюкзак мужской'] },
      { sku: '12345014', keywords: ['коврик для йоги', 'йога мат', 'коврик фитнес нескользящий'] },
    ];
    for (const kd of keywordDefs) {
      for (const kw of kd.keywords) {
        await client.query(
          `INSERT INTO tracked_keywords (user_id, platform, sku, keyword) VALUES ($1,'wb',$2,$3)`,
          [userId, kd.sku, kw],
        );
      }
    }

    // ── Support ticket (демо-обращение) ───────────────────────────────────────
    const { rows: [ticket] } = await client.query(
      `INSERT INTO support_tickets (user_id, topic, subject, message, status)
       VALUES ($1,'autopilot','Как настроить автопилот цен?','Добрый день! Хотел бы настроить автоматическое управление ценами на основе конкурентов. Как это сделать правильно?','closed')
       RETURNING id`,
      [userId],
    );
    await client.query(
      `INSERT INTO support_replies (ticket_id, author_id, is_admin, message)
       VALUES ($1, NULL, true, 'Добрый день! Для настройки автопилота цен перейдите в раздел «Автопилот» → «Правила цен». Создайте правило с стратегией "Конкурент" и укажите отступ -2% — система будет автоматически устанавливать цену чуть ниже ближайшего конкурента. Если нужна помощь — обращайтесь!')`,
      [ticket.id],
    );

    // ── Onboarding — mark as dismissed so wizard doesn't pop up ──────────────
    await client.query(
      `INSERT INTO onboarding_progress (user_id, steps_done, dismissed)
       VALUES ($1, ARRAY['connect_marketplace','add_products','setup_autopilot','run_scenario'], true)
       ON CONFLICT (user_id) DO UPDATE SET dismissed=true, steps_done=ARRAY['connect_marketplace','add_products','setup_autopilot','run_scenario']`,
      [userId],
    );

    // ── Subscription (business, 24h) ──────────────────────────────────────────
    await client.query(
      `INSERT INTO subscriptions (user_id, plan, expires_at)
       VALUES ($1, 'business', now() + interval '24 hours')
       ON CONFLICT (user_id) DO UPDATE SET plan='business', expires_at=now() + interval '24 hours', updated_at=now()`,
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
