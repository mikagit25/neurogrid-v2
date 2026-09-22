import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './modules/auth/auth.routes';
import { connectionsRouter } from './modules/connections/connections.routes';
import { scenariosRouter } from './modules/scenarios/scenarios.routes';
import { runsRouter } from './modules/runs/runs.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { automationsRouter } from './modules/automations/automations.routes';
import { productsRouter } from './modules/products/products.routes';
import { uploadsRouter } from './modules/uploads/uploads.routes';
import { autopilotRouter } from './modules/autopilot/autopilot.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { warehouseRouter } from './modules/warehouse/warehouse.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes';
import { pnlRouter } from './modules/pnl/pnl.routes';
import { alertsRouter } from './modules/alerts/alerts.routes';
import { advertisingRouter } from './modules/advertising/advertising.routes';
import { seoRouter } from './modules/seo/seo.routes';
import { launchRouter } from './modules/launch/launch.routes';
import { reviewsRouter } from './modules/reviews/reviews.routes';
import { supplyRouter } from './modules/supply/supply.routes';
import { returnsRouter } from './modules/returns/returns.routes';
import { apiKeysRouter } from './modules/apikeys/apikeys.routes';
import { telegramRouter } from './modules/telegram/telegram.routes';
import { teamsRouter } from './modules/teams/teams.routes';
import { webhooksRouter } from './modules/webhooks/webhooks.routes';
import { onboardingRouter } from './modules/onboarding/onboarding.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { calculatorRouter } from './modules/calculator/calculator.routes';
import { nicheRouter } from './modules/niche/niche.routes';
import { searchRouter } from './modules/search/search.routes';
import { competitorsRouter } from './modules/competitors/competitors.routes';
import { promoRouter } from './modules/promo/promo.routes';
import { watchlistRouter } from './modules/watchlist/watchlist.routes';
import { activityRouter } from './modules/activity/activity.routes';
import { exportRouter } from './modules/export/export.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { startWorker } from './queue/queue';
import { processScenarioJob } from './queue/workers/scenario.worker';
import { startAutomationWorker } from './queue/workers/automation.worker';
import { startSyncWorker } from './queue/workers/sync.worker';
import { startAlertWorker } from './queue/workers/alert.worker';
import { db } from './db';

const app = express();

// Trust nginx reverse proxy so express-rate-limit can read X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
// WebPay sends webhook as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// Strict rate limit only on unauthenticated auth actions (login/register)
const authActionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login', authActionLimiter);
app.use('/api/auth/register', authActionLimiter);
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.use('/api/auth', authRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/runs', runsRouter);
app.use('/api/wallet', billingRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/automations', automationsRouter);
app.use('/api/products', productsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/autopilot', autopilotRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/warehouse', warehouseRouter);
app.use('/api/finance', financeRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/pnl', pnlRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/advertising', advertisingRouter);
app.use('/api/seo', seoRouter);
app.use('/api/launch', launchRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/supply', supplyRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/api-keys', apiKeysRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/chat', chatRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/calculator', calculatorRouter);
app.use('/api/niche', nicheRouter);
app.use('/api/search', searchRouter);
app.use('/api/competitors', competitorsRouter);
app.use('/api/promo', promoRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/activity', activityRouter);
app.use('/api/export', exportRouter);
app.use('/api/dashboard', dashboardRouter);

// Serve generated images (infographics, AI photos)
app.use('/images', express.static(path.join(__dirname, '../public/images')));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Global Express error handler — must have exactly 4 args to be recognised by Express
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  if (status >= 500) console.error('[unhandled route error]', err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Start BullMQ workers
startWorker(processScenarioJob);
startAutomationWorker();
startSyncWorker();
startAlertWorker();

// Purge expired demo accounts every 15 minutes
setInterval(async () => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM users WHERE is_demo = true AND demo_expires_at < now()`,
    );
    if (rowCount && rowCount > 0) {
      console.log(`[demo-cleanup] Removed ${rowCount} expired demo accounts`);
    }
  } catch (err) {
    console.error('[demo-cleanup]', err);
  }
}, 15 * 60 * 1000);

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Give logger time to flush, then exit — PM2 will restart
  setTimeout(() => process.exit(1), 500);
});

app.listen(config.port, () => {
  console.log(`NeuroGrid backend :${config.port} [${config.nodeEnv}]`);
});

export default app;
