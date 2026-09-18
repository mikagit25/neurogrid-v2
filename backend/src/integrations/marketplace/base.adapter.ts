export interface ProductInfo {
  sku: string;
  title: string;
  price: number;
  stock: number;
  categoryId?: string;
  description?: string;
}

export interface CompetitorPrice {
  sku: string;
  competitorName: string;
  price: number;
  url?: string;
}

export interface ReviewOrQuestion {
  id: string;
  type: 'review' | 'question';
  text: string;
  authorName?: string;
  rating?: number;
  createdAt: string;
}

export interface MarketplaceAdapter {
  readonly platform: 'ozon' | 'wb';

  /** Verify credentials are valid — throw if not */
  validateCredentials(): Promise<void>;

  getProducts(limit?: number): Promise<ProductInfo[]>;
  getProduct(sku: string): Promise<ProductInfo>;
  getStockHistory(sku: string, days: number): Promise<{ date: string; sold: number }[]>;
  getCompetitorPrices(sku: string): Promise<CompetitorPrice[]>;
  getReviewsAndQuestions(limit?: number): Promise<ReviewOrQuestion[]>;

  updatePrice(sku: string, price: number): Promise<void>;
  updateProductContent(sku: string, title: string, description: string): Promise<void>;
}
