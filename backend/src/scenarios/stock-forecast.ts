import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';

/**
 * Сценарий 4: Прогноз дефицита остатков
 * Вход: список SKU (или все товары), порог дней
 * Выход: товары с риском обнуления + рекомендуемая дата дозаказа
 */
export class StockForecastExecutor implements ScenarioExecutor {
  readonly slug = 'stock-forecast';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { adapter, inputData } = ctx;
    const thresholdDays = Number(inputData.thresholdDays ?? 14);
    const skuList = Array.isArray(inputData.skus) ? (inputData.skus as string[]) : [];

    if (!adapter) throw new Error('Marketplace connection required');

    const products = skuList.length > 0
      ? await Promise.all(skuList.map((sku) => adapter.getProduct(sku)))
      : await adapter.getProducts(200);

    const results = await Promise.all(
      products.map(async (product) => {
        const history = await adapter
          .getStockHistory(product.sku, 30)
          .catch(() => [] as { date: string; sold: number }[]);

        const totalSold = history.reduce((sum, d) => sum + d.sold, 0);
        const daysWithSales = history.filter((d) => d.sold > 0).length;
        const avgDailySales = daysWithSales > 0 ? totalSold / 30 : 0;

        const daysUntilZero =
          avgDailySales > 0 ? Math.floor(product.stock / avgDailySales) : null;

        const atRisk = daysUntilZero !== null && daysUntilZero <= thresholdDays;

        const reorderDate =
          daysUntilZero !== null
            ? new Date(Date.now() + Math.max(0, daysUntilZero - 7) * 86400_000)
                .toISOString()
                .slice(0, 10)
            : null;

        return {
          sku: product.sku,
          title: product.title,
          currentStock: product.stock,
          avgDailySales: Math.round(avgDailySales * 10) / 10,
          daysUntilZero,
          atRisk,
          reorderBy: reorderDate,
        };
      })
    );

    const atRisk = results.filter((r) => r.atRisk);
    const safe = results.filter((r) => !r.atRisk);

    return {
      atRisk,
      safe,
      summary: `Товаров с риском дефицита (≤${thresholdDays} дней): ${atRisk.length} из ${results.length}`,
    };
  }
}
