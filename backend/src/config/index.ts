import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4001', 10),
  appUrl: process.env.APP_URL || 'http://localhost:4001',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  db: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  encryption: {
    key: required('ENCRYPTION_KEY'),
  },

  llm: {
    // Text model — used for card generation, SEO, review drafts, etc.
    provider: process.env.LLM_PROVIDER || 'ollama',
    apiKey: process.env.LLM_API_KEY || 'ollama',
    baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
    model: process.env.LLM_MODEL || 'qwen3:8b',

    // Vision model — used when messages contain images (autopilot analyze, photo img2img, multi-photo-studio).
    // Falls back to text model config if not separately configured.
    visionApiKey: process.env.LLM_VISION_API_KEY || process.env.LLM_API_KEY || 'ollama',
    visionBaseUrl: process.env.LLM_VISION_BASE_URL || process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
    visionModel: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL || 'qwen3:8b',
  },

  webpay: {
    storeId: process.env.WEBPAY_STORE_ID || '',
    secretKey: process.env.WEBPAY_SECRET_KEY || '',
    sandbox: process.env.WEBPAY_SANDBOX !== 'false', // default true until production credentials set
    currency: process.env.WEBPAY_CURRENCY || 'BYN',
  },

  image: {
    // 'pollinations' = free, no key. 'together' = paid Together AI key required.
    provider: process.env.IMAGE_PROVIDER || 'pollinations',
    apiKey: process.env.IMAGE_API_KEY || '',
    defaultModel: process.env.IMAGE_MODEL || 'flux',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4001/api/auth/google/callback',
  },
};
