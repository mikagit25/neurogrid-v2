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
    provider: process.env.LLM_PROVIDER || 'openrouter',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.LLM_MODEL || 'anthropic/claude-3-5-sonnet',
  },

  bepaid: {
    shopId: process.env.BEPAID_SHOP_ID || '',
    secretKey: process.env.BEPAID_SECRET_KEY || '',
    sandbox: process.env.BEPAID_SANDBOX === 'true',
  },

  image: {
    provider: process.env.IMAGE_PROVIDER || 'together',
    apiKey: process.env.IMAGE_API_KEY || '',
    defaultModel: process.env.IMAGE_MODEL || 'black-forest-labs/FLUX.1.1-pro',
  },
};
