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
import { startWorker } from './queue/queue';
import { processScenarioJob } from './queue/workers/scenario.worker';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

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

// Serve generated images (infographics, AI photos)
app.use('/images', express.static(path.join(__dirname, '../public/images')));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Start BullMQ worker in the same process (fine for MVP scale)
startWorker(processScenarioJob);

app.listen(config.port, () => {
  console.log(`NeuroGrid backend :${config.port} [${config.nodeEnv}]`);
});

export default app;
