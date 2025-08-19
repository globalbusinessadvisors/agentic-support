import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.GITHUB_TOKEN = 'test-github-token';
process.env.GITHUB_OWNER = 'test-owner';
process.env.GITHUB_REPO = 'test-repo';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.GMAIL_CLIENT_ID = 'test-client-id';
process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
process.env.SUPPORT_EMAIL = 'test@example.com';
process.env.DOMAIN = 'example.com';
process.env.CONFIDENCE_THRESHOLD = '0.8';
process.env.AUTO_REPLY_ENABLED = 'true';
process.env.HUMAN_REVIEW_REQUIRED = 'true';

// Create test directories
const testDirs = [
  path.join(__dirname, '../../data'),
  path.join(__dirname, '../../logs')
];

beforeAll(() => {
  testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

// Clean up after each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  generateEmail: () => ({
    messageId: `${Date.now()}@test.com`,
    threadId: `thread-${Date.now()}`,
    from: 'sender@test.com',
    to: 'support@example.com',
    subject: 'Test Subject',
    body: 'Test body content',
    date: new Date()
  }),
  
  generateIssue: () => ({
    number: Math.floor(Math.random() * 1000),
    title: 'Test Issue',
    body: 'Test issue body',
    state: 'open' as const,
    user: { login: 'testuser' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
};