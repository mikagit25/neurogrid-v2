import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { callLlm } from '../../integrations/llm/llm.client';

export const calculatorRouter = Router();
calculatorRouter.use(authenticate);

interface UnitEconInput {
  sellingPrice: number;       // price the buyer pays
  cogs: number;               // your cost of goods
  logistics: number;          // delivery/fulfillment cost per unit
  commissionPct: number;      // marketplace commission %
  returnRatePct: number;      // expected return rate %
  adSpendPerUnit: number;     // ad spend per sold unit
  monthlyVolume?: number;     // optional: expected monthly sales
}

interface UnitEconResult {
  grossRevenue: number;
  marketplaceFee: number;
  returnCost: number;
  adSpend: number;
  totalCosts: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  breakEvenVolume: number;    // units/month to cover fixed costs (approx)
  roiPct: number;
  monthlyProfit?: number;
  annualProfit?: number;
}

// POST /api/calculator/unit-economics
calculatorRouter.post('/unit-economics', (req: Request, res: Response) => {
  const {
    sellingPrice = 0,
    cogs = 0,
    logistics = 0,
    commissionPct = 0,
    returnRatePct = 0,
    adSpendPerUnit = 0,
    monthlyVolume,
  } = req.body as UnitEconInput;

  if (sellingPrice <= 0) {
    res.status(400).json({ error: 'sellingPrice must be > 0' });
    return;
  }

  const marketplaceFee = sellingPrice * (commissionPct / 100);
  const returnCost = sellingPrice * (returnRatePct / 100) * 0.5; // partial cost: logistics back
  const adSpend = adSpendPerUnit;

  const grossRevenue = sellingPrice - marketplaceFee - returnCost;
  const totalCosts = cogs + logistics + adSpend;
  const grossProfit = sellingPrice - marketplaceFee - cogs;
  const netProfit = grossRevenue - totalCosts;

  const grossMarginPct = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;
  const netMarginPct = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  const roiPct = cogs > 0 ? (netProfit / cogs) * 100 : 0;

  // Break-even: how many units to cover ad fixed costs (simplified)
  const breakEvenVolume = netProfit > 0 ? 0 : netProfit < 0 ? Infinity : 1;

  const result: UnitEconResult = {
    grossRevenue: +grossRevenue.toFixed(2),
    marketplaceFee: +marketplaceFee.toFixed(2),
    returnCost: +returnCost.toFixed(2),
    adSpend: +adSpend.toFixed(2),
    totalCosts: +totalCosts.toFixed(2),
    grossProfit: +grossProfit.toFixed(2),
    netProfit: +netProfit.toFixed(2),
    grossMarginPct: +grossMarginPct.toFixed(1),
    netMarginPct: +netMarginPct.toFixed(1),
    breakEvenVolume: isFinite(breakEvenVolume) ? +breakEvenVolume.toFixed(0) : 0,
    roiPct: +roiPct.toFixed(1),
  };

  if (monthlyVolume && monthlyVolume > 0) {
    result.monthlyProfit = +(netProfit * monthlyVolume).toFixed(2);
    result.annualProfit = +(netProfit * monthlyVolume * 12).toFixed(2);
  }

  res.json({ result });
});

// POST /api/calculator/ai-advice — AI evaluation of unit economics result
calculatorRouter.post('/ai-advice', async (req: Request, res: Response) => {
  const {
    sellingPrice, cogs, logistics, commissionPct, returnRatePct,
    adSpendPerUnit, monthlyVolume,
    // pre-computed result (if passed)
    netMarginPct, grossMarginPct, netProfit, roiPct, monthlyProfit,
  } = req.body;

  if (!sellingPrice || sellingPrice <= 0) {
    res.status(400).json({ error: 'sellingPrice required' });
    return;
  }

  // Use provided results or recalculate
  const fee = sellingPrice * ((commissionPct || 0) / 100);
  const retCost = sellingPrice * ((returnRatePct || 0) / 100) * 0.5;
  const adSpend = adSpendPerUnit || 0;
  const computedNetProfit = netProfit != null ? netProfit : (sellingPrice - fee - retCost - (cogs || 0) - (logistics || 0) - adSpend);
  const computedNetMargin = netMarginPct != null ? netMarginPct : (sellingPrice > 0 ? (computedNetProfit / sellingPrice) * 100 : 0);
  const computedGrossMargin = grossMarginPct != null ? grossMarginPct : (sellingPrice > 0 ? ((sellingPrice - fee - (cogs || 0)) / sellingPrice) * 100 : 0);
  const computedRoi = roiPct != null ? roiPct : (cogs > 0 ? (computedNetProfit / cogs) * 100 : 0);

  // Identify the biggest cost driver
  const costs: Array<{ name: string; value: number }> = [
    { name: 'себестоимость', value: cogs || 0 },
    { name: 'логистика', value: logistics || 0 },
    { name: 'комиссия МП', value: fee },
    { name: 'реклама', value: adSpend },
    { name: 'возвраты', value: retCost },
  ].sort((a, b) => b.value - a.value);

  const prompt = `/no_think Ты — финансовый аналитик маркетплейсов. Оцени юнит-экономику товара.

Цена продажи: ${sellingPrice}₽
Себестоимость: ${cogs || 0}₽ | Логистика: ${logistics || 0}₽ | Комиссия МП: ${commissionPct || 0}% (${Math.round(fee)}₽)
Возвраты: ${returnRatePct || 0}% | Реклама: ${adSpend}₽/ед
${monthlyVolume ? `Ожидаемый объём: ${monthlyVolume} шт/мес` : ''}

Результат: чистая прибыль=${Math.round(computedNetProfit)}₽ | чистая маржа=${computedNetMargin.toFixed(1)}% | валовая маржа=${computedGrossMargin.toFixed(1)}% | ROI=${computedRoi.toFixed(1)}%
Основной статья затрат: ${costs[0].name} (${Math.round(costs[0].value)}₽)

Ответь СТРОГО в JSON:
{
  "summary": "<2-3 предложения об общей оценке юнит-экономики>",
  "verdict": "<healthy|warning|critical|loss>",
  "verdict_label": "<Отличная маржа|Приемлемо|Требует оптимизации|Убыток>",
  "main_issues": ["<проблема 1>","<проблема 2>"],
  "optimizations": [
    {"lever":"<что изменить — цена/логистика/реклама/себестоимость>","potential":"<на сколько % можно улучшить маржу>","action":"<конкретное действие>"}
  ],
  "pricing_advice": "<совет по ценообразованию для данного товара>",
  "benchmark": "<ориентир: хорошая маржа для маркетплейса обычно X-Y%>"
}`;

  try {
    const { text } = await callLlm([{ role: 'user', content: prompt }], undefined, 900);

    let result: any = null;
    try {
      const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    } catch { result = null; }

    if (!result) {
      const verdict = computedNetMargin >= 20 ? 'healthy' : computedNetMargin >= 10 ? 'warning' : computedNetMargin >= 0 ? 'critical' : 'loss';
      result = {
        summary: `Чистая маржа ${computedNetMargin.toFixed(1)}%. ${verdict === 'healthy' ? 'Хороший результат.' : verdict === 'loss' ? 'Товар убыточен.' : 'Есть потенциал для улучшения.'}`,
        verdict,
        verdict_label: verdict === 'healthy' ? 'Отличная маржа' : verdict === 'warning' ? 'Приемлемо' : verdict === 'critical' ? 'Требует оптимизации' : 'Убыток',
        main_issues: computedNetMargin < 10 ? [`Низкая маржа: ${computedNetMargin.toFixed(1)}%`, `Основная статья затрат: ${costs[0].name}`] : [],
        optimizations: [
          { lever: costs[0].name, potential: '3-7%', action: `Снизьте ${costs[0].name} для улучшения маржи` },
        ],
        pricing_advice: computedNetMargin < 5 ? 'Рассмотрите повышение цены на 10-15%' : 'Цена находится в разумных пределах',
        benchmark: 'Хорошая маржа для маркетплейса: 15-25% чистой прибыли',
      };
    }

    res.json({ ...result, computed: { net_margin_pct: +computedNetMargin.toFixed(1), net_profit: +computedNetProfit.toFixed(2), roi_pct: +computedRoi.toFixed(1) }, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
