import { MarketplaceAdapter } from '../integrations/marketplace/base.adapter';

export interface ScenarioContext {
  adapter: MarketplaceAdapter | null;
  inputData: Record<string, unknown>;
}

export interface ScenarioResult {
  [key: string]: unknown;
}

export interface ScenarioExecutor {
  readonly slug: string;
  execute(ctx: ScenarioContext): Promise<ScenarioResult>;
}
