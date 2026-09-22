import axios from 'axios';
import { db } from '../../db';
import { decrypt } from '../../utils/encryption';

// ---- WB Advertising Client ----

async function getWbCampaigns(apiKey: string) {
  const client = axios.create({
    baseURL: 'https://advert-api.wildberries.ru',
    headers: { Authorization: apiKey },
    timeout: 20_000,
  });
  try {
    // Get campaign counts first
    const countRes = await client.get('/adv/v1/promotion/count');
    const adverts = countRes.data.adverts ?? [];

    // Collect all campaign IDs across statuses
    const allIds: number[] = adverts.flatMap((group: any) => group.advert_list?.map((a: any) => a.advertId) ?? []);
    if (!allIds.length) return [];

    // Fetch campaign details (limit 50 per request)
    const chunks = [];
    for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50));

    const campaigns: any[] = [];
    for (const chunk of chunks) {
      try {
        const r = await client.get('/adv/v1/promotion/adverts', {
          params: { id: chunk.join(',') },
        });
        campaigns.push(...(Array.isArray(r.data) ? r.data : []));
      } catch {}
    }

    // Fetch stats for running campaigns
    const runningIds = campaigns.filter(c => c.status === 7).map(c => c.advertId).slice(0, 50);
    let statsMap: Record<number, any> = {};
    if (runningIds.length) {
      try {
        const statsRes = await client.post('/adv/v2/fullstat', runningIds);
        for (const s of (Array.isArray(statsRes.data) ? statsRes.data : [])) {
          statsMap[s.advertId] = s;
        }
      } catch {}
    }

    const statusMap: Record<string, string> = { '7': 'running', '11': 'paused', '9': 'ready', '4': 'stopped' };
    return campaigns.map((c: any) => {
      const s = statsMap[c.advertId] ?? {};
      const views = s.views ?? 0;
      const clicks = s.clicks ?? 0;
      const spend = s.sum ?? 0;
      const orders = s.orders ?? 0;
      const revenue = s.revenue ?? 0;
      return {
        externalId: String(c.advertId),
        name: c.name ?? `Кампания ${c.advertId}`,
        campaignType: c.type === 8 ? 'auto' : c.type === 9 ? 'search' : c.type === 6 ? 'catalog' : 'other',
        status: statusMap[String(c.status)] ?? 'unknown',
        budget: c.budget ?? null,
        dailyBudget: c.dailyBudget ?? null,
        bid: c.cpm ?? null,
        impressions: views,
        clicks,
        spend,
        orders,
        revenue,
        ctr: views > 0 ? clicks / views : 0,
        drr: revenue > 0 ? spend / revenue : 0,
      };
    });
  } catch (err: any) {
    console.error('[advertising] WB campaign fetch error:', err.message);
    return [];
  }
}

// ---- Ozon Performance Client ----

async function getOzonCampaigns(clientId: string, clientSecret: string) {
  try {
    // Get auth token
    const tokenRes = await axios.post('https://api-performance.ozon.ru/api/client/token', {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }, { timeout: 15_000 });
    const token = tokenRes.data.access_token;
    if (!token) return [];

    const client = axios.create({
      baseURL: 'https://api-performance.ozon.ru',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
    });

    const listRes = await client.get('/api/client/campaign', {
      params: { state: 'CAMPAIGN_STATE_RUNNING,CAMPAIGN_STATE_PAUSED,CAMPAIGN_STATE_STOPPED', pageSize: 50 },
    });
    const campaigns: any[] = listRes.data?.list ?? [];

    return campaigns.map((c: any) => ({
      externalId: String(c.id),
      name: c.title ?? `Кампания ${c.id}`,
      campaignType: c.advObjectType ?? 'SKU',
      status: c.state === 'CAMPAIGN_STATE_RUNNING' ? 'running' : c.state === 'CAMPAIGN_STATE_PAUSED' ? 'paused' : 'stopped',
      budget: c.budget ?? null,
      dailyBudget: c.dailyBudget ?? null,
      bid: null,
      impressions: Number(c.statistic?.views ?? 0),
      clicks: Number(c.statistic?.clicks ?? 0),
      spend: Number(c.statistic?.moneySpent ?? 0),
      orders: Number(c.statistic?.orders ?? 0),
      revenue: Number(c.statistic?.revenue ?? 0),
      ctr: Number(c.statistic?.ctr ?? 0) / 100,
      drr: Number(c.statistic?.drr ?? 0) / 100,
    }));
  } catch (err: any) {
    console.error('[advertising] Ozon campaign fetch error:', err.message);
    return [];
  }
}

// ---- Sync ----

export async function syncAdCampaigns(userId: string): Promise<{ synced: number; errors: number }> {
  const { rows: connections } = await db.query(
    `SELECT id, platform, credentials_enc FROM marketplace_connections WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );

  let synced = 0;
  let errors = 0;

  for (const conn of connections) {
    try {
      const creds = JSON.parse(decrypt(conn.credentials_enc));
      let campaigns: any[] = [];

      if (conn.platform === 'wb' && creds.advertApiKey) {
        campaigns = await getWbCampaigns(creds.advertApiKey);
      } else if (conn.platform === 'ozon' && creds.performanceClientId && creds.performanceClientSecret) {
        campaigns = await getOzonCampaigns(creds.performanceClientId, creds.performanceClientSecret);
      } else {
        continue;
      }

      for (const c of campaigns) {
        await db.query(
          `INSERT INTO ad_campaigns
             (connection_id, user_id, platform, external_id, name, campaign_type, status,
              budget, daily_budget, bid, impressions, clicks, spend, orders, revenue, ctr, drr, stats_date, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CURRENT_DATE,now())
           ON CONFLICT (connection_id, external_id) DO UPDATE SET
             name = $5, status = $7, budget = $8, daily_budget = $9, bid = $10,
             impressions = $11, clicks = $12, spend = $13, orders = $14, revenue = $15,
             ctr = $16, drr = $17, stats_date = CURRENT_DATE, synced_at = now()`,
          [conn.id, userId, conn.platform, c.externalId, c.name, c.campaignType, c.status,
           c.budget, c.dailyBudget, c.bid, c.impressions, c.clicks, c.spend,
           c.orders, c.revenue, c.ctr, c.drr],
        );
        synced++;
      }
    } catch (err: any) {
      console.error(`[advertising] sync error conn=${conn.id}:`, err.message);
      errors++;
    }
  }
  return { synced, errors };
}

// ---- Dayparting ----

export async function getDayparting(userId: string, campaignId: string) {
  const { rows } = await db.query(
    `SELECT ds.* FROM dayparting_schedules ds
     JOIN ad_campaigns ac ON ac.id = ds.campaign_id
     WHERE ds.campaign_id = $1 AND ac.user_id = $2`,
    [campaignId, userId],
  );
  if (!rows.length) {
    // Return default all-on schedule
    return {
      schedule: Array(7).fill(null).map(() => Array(24).fill(true)),
      is_active: false,
    };
  }
  return rows[0];
}

export async function saveDayparting(
  userId: string,
  campaignId: string,
  schedule: boolean[][],
  isActive: boolean,
) {
  // Verify campaign belongs to user
  const { rows } = await db.query(
    'SELECT id FROM ad_campaigns WHERE id = $1 AND user_id = $2',
    [campaignId, userId],
  );
  if (!rows.length) throw new Error('Campaign not found');

  await db.query(
    `INSERT INTO dayparting_schedules (user_id, campaign_id, schedule, is_active, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (campaign_id) DO UPDATE
     SET schedule = $3, is_active = $4, updated_at = now()`,
    [userId, campaignId, JSON.stringify(schedule), isActive],
  );
}

// ---- AI Bidder ----

export async function getBidderRule(userId: string, campaignId: string) {
  const { rows } = await db.query(
    `SELECT abr.* FROM ai_bidder_rules abr
     JOIN ad_campaigns ac ON ac.id = abr.campaign_id
     WHERE abr.campaign_id = $1 AND ac.user_id = $2`,
    [campaignId, userId],
  );
  return rows[0] ?? { is_active: false, mode: 'hold', max_drr_pct: 25, max_bid: null, min_bid: null };
}

export async function saveBidderRule(
  userId: string,
  campaignId: string,
  data: { is_active: boolean; mode: string; max_drr_pct: number; max_bid?: number; min_bid?: number },
) {
  const { rows } = await db.query(
    'SELECT id FROM ad_campaigns WHERE id = $1 AND user_id = $2',
    [campaignId, userId],
  );
  if (!rows.length) throw new Error('Campaign not found');

  await db.query(
    `INSERT INTO ai_bidder_rules (user_id, campaign_id, is_active, mode, max_drr_pct, max_bid, min_bid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (campaign_id) DO UPDATE
     SET is_active=$3, mode=$4, max_drr_pct=$5, max_bid=$6, min_bid=$7, updated_at=now()`,
    [userId, campaignId, data.is_active, data.mode, data.max_drr_pct, data.max_bid ?? null, data.min_bid ?? null],
  );
}

// ---- AI Bidder Worker Logic ----

export async function runAiBidder(): Promise<void> {
  const { rows: rules } = await db.query(
    `SELECT abr.*, ac.platform, ac.external_id, ac.drr, ac.spend, ac.revenue, ac.bid,
            mc.credentials_enc
     FROM ai_bidder_rules abr
     JOIN ad_campaigns ac ON ac.id = abr.campaign_id
     JOIN marketplace_connections mc ON mc.id = ac.connection_id
     WHERE abr.is_active = true AND ac.status = 'running'`,
  );

  for (const rule of rules) {
    try {
      const currentDrr = Number(rule.drr ?? 0) * 100;
      const currentBid = Number(rule.bid ?? 0);
      let action = '';
      let newBid: number | null = null;

      if (currentDrr > Number(rule.max_drr_pct)) {
        // DRR too high — reduce bid by 10%
        newBid = Math.max(currentBid * 0.9, Number(rule.min_bid ?? 0));
        action = `DRR ${currentDrr.toFixed(1)}% > ${rule.max_drr_pct}% → снизил ставку до ${newBid.toFixed(2)}`;
      } else if (rule.mode === 'aggressive_growth' && currentDrr < Number(rule.max_drr_pct) * 0.6) {
        // DRR well under limit in aggressive mode — raise bid by 5%
        const maxBid = Number(rule.max_bid ?? Infinity);
        newBid = Math.min(currentBid * 1.05, maxBid);
        if (newBid !== currentBid) {
          action = `Агрессивный рост: DRR ${currentDrr.toFixed(1)}% → поднял ставку до ${newBid.toFixed(2)}`;
        }
      }

      if (action) {
        await db.query(
          `UPDATE ai_bidder_rules SET last_action=$1, last_action_at=now() WHERE id=$2`,
          [action, rule.id],
        );
        console.log(`[ai-bidder] campaign=${rule.external_id} platform=${rule.platform}: ${action}`);
      }
    } catch (err: any) {
      console.error(`[ai-bidder] rule ${rule.id}:`, err.message);
    }
  }
}

// ---- Dayparting Worker Logic ----
// Checks current Moscow hour and pauses/resumes campaigns per schedule

export async function runDaypartingCheck(): Promise<void> {
  const now = new Date();
  // Moscow time = UTC+3
  const moscowHour = (now.getUTCHours() + 3) % 24;
  const moscowDay = new Date(now.getTime() + 3 * 3600_000).getUTCDay(); // 0=Sun..6=Sat
  // Convert to Mon=0..Sun=6
  const dayIdx = moscowDay === 0 ? 6 : moscowDay - 1;

  const { rows } = await db.query(
    `SELECT ds.*, ac.platform, ac.external_id, ac.status, ac.connection_id, mc.credentials_enc
     FROM dayparting_schedules ds
     JOIN ad_campaigns ac ON ac.id = ds.campaign_id
     JOIN marketplace_connections mc ON mc.id = ac.connection_id
     WHERE ds.is_active = true`,
  );

  for (const row of rows) {
    try {
      const schedule: boolean[][] = row.schedule;
      const shouldRun = schedule[dayIdx]?.[moscowHour] ?? true;
      const isRunning = row.status === 'running';

      if (shouldRun && !isRunning) {
        console.log(`[dayparting] resume campaign=${row.external_id} platform=${row.platform}`);
        // TODO: call adapter to resume — for now just log
      } else if (!shouldRun && isRunning) {
        console.log(`[dayparting] pause campaign=${row.external_id} platform=${row.platform}`);
        // TODO: call adapter to pause — for now just log
      }
    } catch (err: any) {
      console.error(`[dayparting] campaign=${row.external_id}:`, err.message);
    }
  }
}
