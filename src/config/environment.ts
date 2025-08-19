import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // GitHub Configuration
  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  },
  
  // Gmail OAuth2 Configuration
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
    domain: process.env.DOMAIN || 'example.com',
  },
  
  // Database Configuration
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/support.db'),
  },
  
  // Agent Configuration
  agent: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.8'),
    autoReplyEnabled: process.env.AUTO_REPLY_ENABLED === 'true',
    humanReviewRequired: process.env.HUMAN_REVIEW_REQUIRED !== 'false',
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  },
  
  // Security
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || path.join(__dirname, '../../logs/app.log'),
  },
};

export function validateConfig() {
  const required = [
    'github.token',
    'github.owner',
    'github.repo',
    'gmail.clientId',
    'gmail.clientSecret',
    'gmail.refreshToken',
    'gmail.supportEmail',
  ];
  
  const missing: string[] = [];
  
  for (const key of required) {
    const keys = key.split('.');
    let value: any = config;
    for (const k of keys) {
      value = value[k];
    }
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}