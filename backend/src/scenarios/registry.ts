import { ScenarioExecutor } from './base';
import { CardGeneratorExecutor } from './card-generator';
import { PriceMonitorExecutor } from './price-monitor';
import { ReviewDraftsExecutor } from './review-drafts';
import { StockForecastExecutor } from './stock-forecast';
import { SeoAuditExecutor } from './seo-audit';
import { PhotoGeneratorExecutor } from './photo-generator';
import { InfographicGeneratorExecutor } from './infographic-generator';

const executors: ScenarioExecutor[] = [
  new CardGeneratorExecutor(),
  new PriceMonitorExecutor(),
  new ReviewDraftsExecutor(),
  new StockForecastExecutor(),
  new SeoAuditExecutor(),
  new PhotoGeneratorExecutor(),
  new InfographicGeneratorExecutor(),
];

const registry = new Map<string, ScenarioExecutor>(
  executors.map((e) => [e.slug, e])
);

export function getExecutor(slug: string): ScenarioExecutor {
  const executor = registry.get(slug);
  if (!executor) throw new Error(`Unknown scenario: ${slug}`);
  return executor;
}
