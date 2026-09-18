import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './modules/auth/auth.routes';
import { connectionsRouter } from './modules/connections/connections.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use('/api/auth', authRouter);
app.use('/api/connections', connectionsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(config.port, () => {
  console.log(`NeuroGrid backend listening on :${config.port} [${config.nodeEnv}]`);
});

export default app;
