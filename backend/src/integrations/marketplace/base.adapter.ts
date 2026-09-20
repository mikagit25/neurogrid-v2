export interface SalesDay {
  date: string;        // YYYY-MM-DD
  revenue: number;     // gross revenue ₽
  orders: number;      // orders placed
  returns: number;     // items returned
  commissions: number; // platform commissions ₽
  netPayout: number;   // seller receives ₽
}

export interface FinanceSummary {
  revenue: number;
  commissions: number;
  logistics: number;
  penalties: number;
  netPayout: number;
}

export interface OrderLine {
  sku: string;
  offerId: string;
  title: string;
  quantity: number;
  price: number;
}

export interface MarketplaceOrder {
  id: string;
  platform: 'wb' | 'ozon' | 'ym' | 'mm';
  status: string;
  createdAt: string;
  items: OrderLine[];
  // WB
  warehouseId?: number;
  warehouseName?: string;
  nmId?: number;
  // Ozon
  postingNumber?: string;
  deliveryMethod?: string;
  shipByDate?: string;
  upperBarcode?: string;
  lowerBarcode?: string;
}

export interface ProductInfo {
  sku: string;
  title: string;
  price: number;
  stock: number;
  categoryId?: string;
  description?: string;
  photoUrls?: string[];
  characteristics?: Record<string, string>;
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

export interface WarehouseStock {
  sku: string;
  title: string;
  warehouseType: 'fbo' | 'fbs';
  warehouseName: string;
  quantity: number;
}

export interface FinanceRecord {
  sku: string;
  title: string;
  quantity: number;
  revenue: number;
  commission: number;
  logistics: number;
  penalty: number;
  netPayout: number;
}

export interface MarketplaceAdapter {
  readonly platform: 'wb' | 'ozon' | 'ym' | 'mm';

  /** Verify credentials are valid — throw if not */
  validateCredentials(): Promise<void>;

  getProducts(limit?: number): Promise<ProductInfo[]>;
  getProduct(sku: string): Promise<ProductInfo>;
  getStockHistory(sku: string, days: number): Promise<{ date: string; sold: number }[]>;
  getCompetitorPrices(sku: string): Promise<CompetitorPrice[]>;
  getReviewsAndQuestions(limit?: number): Promise<ReviewOrQuestion[]>;

  updatePrice(sku: string, price: number): Promise<void>;
  updateProductContent(sku: string, title: string, description: string): Promise<void>;
  postReviewResponse(reviewId: string, text: string): Promise<void>;
  getStockLevels(): Promise<{ sku: string; stock: number }[]>;

  /** FBO + FBS breakdown per warehouse */
  getWarehouseStocks(): Promise<WarehouseStock[]>;

  // Analytics & Finance
  getSalesByDay(dateFrom: string, dateTo: string): Promise<SalesDay[]>;
  getFinanceSummary(dateFrom: string, dateTo: string): Promise<FinanceSummary>;
  /** Per-SKU finance detail for a period */
  getFinanceRecords(dateFrom: string, dateTo: string): Promise<FinanceRecord[]>;

  // Orders (FBS/FBO)
  getNewOrders(): Promise<MarketplaceOrder[]>;
  getAllOrders(dateFrom?: string): Promise<MarketplaceOrder[]>;
}
