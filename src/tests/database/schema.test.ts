import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../database/schema';
import { v4 as uuidv4 } from 'uuid';

describe('Database Schema', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database();
  });

  afterEach(() => {
    db.close();
  });

  describe('Email Messages', () => {
    it('should insert email message successfully', () => {
      const message = {
        messageId: `msg-${Date.now()}@test.com`,
        threadId: 'thread-123',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'Test Subject',
        body: 'Test Body',
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      const result = db.insertEmailMessage(message);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.messageId).toBe(message.messageId);
    });

    it('should retrieve email by message ID', () => {
      const message = {
        messageId: `msg-${Date.now()}@test.com`,
        threadId: 'thread-456',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'Test',
        body: 'Body',
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      const inserted = db.insertEmailMessage(message);
      const retrieved = db.getEmailByMessageId(message.messageId);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.messageId).toBe(message.messageId);
    });

    it('should update email status', () => {
      const message = {
        messageId: `msg-${Date.now()}@test.com`,
        threadId: 'thread-789',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'Test',
        body: 'Body',
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      const inserted = db.insertEmailMessage(message);
      db.updateEmailStatus(inserted.id, 'processed');
      
      const updated = db.getEmailMessage(inserted.id);
      expect(updated?.status).toBe('processed');
      expect(updated?.processedAt).toBeDefined();
    });

    it('should handle duplicate message IDs', () => {
      const message = {
        messageId: `msg-duplicate@test.com`,
        threadId: 'thread-dup',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'Test',
        body: 'Body',
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      db.insertEmailMessage(message);
      expect(() => db.insertEmailMessage(message)).toThrow();
    });

    it('should store HTML body', () => {
      const message = {
        messageId: `msg-html-${Date.now()}@test.com`,
        threadId: 'thread-html',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'HTML Test',
        body: 'Plain text',
        htmlBody: '<p>HTML content</p>',
        direction: 'outbound' as const,
        status: 'pending' as const
      };

      const result = db.insertEmailMessage(message);
      const retrieved = db.getEmailMessage(result.id);
      
      expect(retrieved?.htmlBody).toBe('<p>HTML content</p>');
    });

    it('should link email to GitHub issue', () => {
      const message = {
        messageId: `msg-github-${Date.now()}@test.com`,
        threadId: 'thread-gh',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'GitHub Test',
        body: 'Body',
        githubIssueNumber: 123,
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      const result = db.insertEmailMessage(message);
      expect(result.githubIssueNumber).toBe(123);
    });

    it('should store email threading headers', () => {
      const message = {
        messageId: `msg-thread-${Date.now()}@test.com`,
        threadId: 'thread-headers',
        inReplyTo: 'original-message@test.com',
        references: 'ref1@test.com ref2@test.com',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'Re: Original',
        body: 'Reply body',
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      const result = db.insertEmailMessage(message);
      const retrieved = db.getEmailMessage(result.id);
      
      expect(retrieved?.inReplyTo).toBe('original-message@test.com');
      expect(retrieved?.references).toBe('ref1@test.com ref2@test.com');
    });

    it('should store metadata as JSON', () => {
      const metadata = { custom: 'data', tags: ['urgent', 'bug'] };
      const message = {
        messageId: `msg-meta-${Date.now()}@test.com`,
        threadId: 'thread-meta',
        from: 'sender@test.com',
        to: 'support@test.com',
        subject: 'Metadata Test',
        body: 'Body',
        metadata: JSON.stringify(metadata),
        direction: 'inbound' as const,
        status: 'pending' as const
      };

      const result = db.insertEmailMessage(message);
      const retrieved = db.getEmailMessage(result.id);
      
      expect(retrieved?.metadata).toBe(JSON.stringify(metadata));
      const parsed = JSON.parse(retrieved?.metadata || '{}');
      expect(parsed.custom).toBe('data');
      expect(parsed.tags).toContain('urgent');
    });
  });

  describe('GitHub Issue Mappings', () => {
    it('should create issue mapping', () => {
      const mapping = db.createIssueMapping(456, 'thread-xyz');
      
      expect(mapping).toBeDefined();
      expect(mapping.issueNumber).toBe(456);
      expect(mapping.emailThreadId).toBe('thread-xyz');
      expect(mapping.emailAlias).toBe('support+issue-456@example.com');
    });

    it('should retrieve mapping by issue number', () => {
      const issueNumber = 789;
      db.createIssueMapping(issueNumber, 'thread-789');
      
      const mapping = db.getIssueMapping(issueNumber);
      expect(mapping).toBeDefined();
      expect(mapping?.issueNumber).toBe(issueNumber);
    });

    it('should retrieve mapping by email alias', () => {
      const issueNumber = 321;
      db.createIssueMapping(issueNumber, 'thread-321');
      
      const mapping = db.getIssueMappingByAlias('support+issue-321@example.com');
      expect(mapping).toBeDefined();
      expect(mapping?.issueNumber).toBe(issueNumber);
    });

    it('should handle duplicate issue numbers', () => {
      const issueNumber = 999;
      db.createIssueMapping(issueNumber, 'thread-1');
      expect(() => db.createIssueMapping(issueNumber, 'thread-2')).toThrow();
    });

    it('should generate unique email aliases', () => {
      const mapping1 = db.createIssueMapping(111, 'thread-111');
      const mapping2 = db.createIssueMapping(222, 'thread-222');
      
      expect(mapping1.emailAlias).not.toBe(mapping2.emailAlias);
      expect(mapping1.emailAlias).toContain('111');
      expect(mapping2.emailAlias).toContain('222');
    });

    it('should track creation and sync timestamps', () => {
      const before = new Date();
      const mapping = db.createIssueMapping(555, 'thread-555');
      const after = new Date();
      
      expect(new Date(mapping.createdAt).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(mapping.createdAt).getTime()).toBeLessThanOrEqual(after.getTime());
      expect(mapping.lastSyncedAt).toBeDefined();
    });
  });

  describe('Agent Actions', () => {
    beforeEach(() => {
      // Create a mapping first for foreign key constraint
      db.createIssueMapping(100, 'thread-100');
    });

    it('should record agent action', () => {
      const action = {
        issueNumber: 100,
        actionType: 'triage' as const,
        confidence: 0.85,
        decision: 'categorize as bug',
        reasoning: 'Keywords detected'
      };

      const result = db.recordAgentAction(action);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.confidence).toBe(0.85);
    });

    it('should retrieve agent action by ID', () => {
      const action = {
        issueNumber: 100,
        actionType: 'auto_reply' as const,
        confidence: 0.92,
        decision: 'send automatic response'
      };

      const recorded = db.recordAgentAction(action);
      const retrieved = db.getAgentAction(recorded.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.confidence).toBe(0.92);
    });

    it('should get pending agent actions', () => {
      // Record multiple actions
      db.recordAgentAction({
        issueNumber: 100,
        actionType: 'triage' as const,
        confidence: 0.7,
        decision: 'needs review',
        humanApproved: null
      });

      db.recordAgentAction({
        issueNumber: 100,
        actionType: 'auto_reply' as const,
        confidence: 0.6,
        decision: 'low confidence',
        humanApproved: false
      });

      const pending = db.getPendingAgentActions();
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every(a => a.humanApproved === null && a.executedAt === null)).toBe(true);
    });

    it('should approve agent action', () => {
      const action = db.recordAgentAction({
        issueNumber: 100,
        actionType: 'auto_reply' as const,
        confidence: 0.9,
        decision: 'approve'
      });

      db.approveAgentAction(action.id, true);
      const approved = db.getAgentAction(action.id);
      
      expect(approved?.humanApproved).toBe(true);
      expect(approved?.executedAt).toBeDefined();
    });

    it('should reject agent action', () => {
      const action = db.recordAgentAction({
        issueNumber: 100,
        actionType: 'escalation' as const,
        confidence: 0.5,
        decision: 'escalate'
      });

      db.approveAgentAction(action.id, false);
      const rejected = db.getAgentAction(action.id);
      
      expect(rejected?.humanApproved).toBe(false);
      expect(rejected?.executedAt).toBeNull();
    });

    it('should store action metadata', () => {
      const metadata = { 
        categories: ['bug', 'urgent'],
        suggestedResponse: 'Thank you for reporting...'
      };

      const action = db.recordAgentAction({
        issueNumber: 100,
        actionType: 'triage' as const,
        confidence: 0.88,
        decision: 'categorized',
        metadata: JSON.stringify(metadata)
      });

      const retrieved = db.getAgentAction(action.id);
      const parsed = JSON.parse(retrieved?.metadata || '{}');
      
      expect(parsed.categories).toContain('bug');
      expect(parsed.suggestedResponse).toContain('Thank you');
    });

    it('should track different action types', () => {
      const actionTypes = ['triage', 'summarize', 'intent_detection', 'auto_reply', 'escalation'];
      
      actionTypes.forEach(type => {
        const action = db.recordAgentAction({
          issueNumber: 100,
          actionType: type as any,
          confidence: 0.75,
          decision: `${type} decision`
        });
        
        expect(action.actionType).toBe(type);
      });
    });

    it('should handle high confidence actions', () => {
      const action = db.recordAgentAction({
        issueNumber: 100,
        actionType: 'auto_reply' as const,
        confidence: 0.95,
        decision: 'high confidence response',
        humanApproved: true,
        executedAt: new Date()
      });

      expect(action.confidence).toBe(0.95);
      expect(action.humanApproved).toBe(true);
      expect(action.executedAt).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const identifier = 'user@test.com';
      const endpoint = '/api/test';
      const windowMs = 60000; // 1 minute
      const maxRequests = 5;

      const allowed = db.checkRateLimit(identifier, endpoint, windowMs, maxRequests);
      expect(allowed).toBe(true);
    });

    it('should block requests exceeding rate limit', () => {
      const identifier = 'spammer@test.com';
      const endpoint = '/api/limited';
      const windowMs = 60000;
      const maxRequests = 3;

      // Make requests up to the limit
      for (let i = 0; i < maxRequests; i++) {
        const allowed = db.checkRateLimit(identifier, endpoint, windowMs, maxRequests);
        expect(allowed).toBe(true);
      }

      // Next request should be blocked
      const blocked = db.checkRateLimit(identifier, endpoint, windowMs, maxRequests);
      expect(blocked).toBe(false);
    });

    it('should track different endpoints separately', () => {
      const identifier = 'user@test.com';
      const windowMs = 60000;
      const maxRequests = 2;

      // Max out endpoint1
      db.checkRateLimit(identifier, '/api/endpoint1', windowMs, maxRequests);
      db.checkRateLimit(identifier, '/api/endpoint1', windowMs, maxRequests);
      
      // Should block endpoint1
      expect(db.checkRateLimit(identifier, '/api/endpoint1', windowMs, maxRequests)).toBe(false);
      
      // But allow endpoint2
      expect(db.checkRateLimit(identifier, '/api/endpoint2', windowMs, maxRequests)).toBe(true);
    });

    it('should track different identifiers separately', () => {
      const endpoint = '/api/shared';
      const windowMs = 60000;
      const maxRequests = 1;

      // Max out user1
      db.checkRateLimit('user1@test.com', endpoint, windowMs, maxRequests);
      expect(db.checkRateLimit('user1@test.com', endpoint, windowMs, maxRequests)).toBe(false);
      
      // But allow user2
      expect(db.checkRateLimit('user2@test.com', endpoint, windowMs, maxRequests)).toBe(true);
    });

    it('should clean up expired rate limit entries', () => {
      const identifier = 'cleanup@test.com';
      const endpoint = '/api/cleanup';
      const windowMs = 100; // Very short window
      const maxRequests = 1;

      // Make a request
      db.checkRateLimit(identifier, endpoint, windowMs, maxRequests);
      
      // Should be blocked immediately
      expect(db.checkRateLimit(identifier, endpoint, windowMs, maxRequests)).toBe(false);
      
      // Wait for window to expire
      setTimeout(() => {
        // Should be allowed again after cleanup
        expect(db.checkRateLimit(identifier, endpoint, windowMs, maxRequests)).toBe(true);
      }, windowMs + 50);
    });
  });

  describe('Knowledge Base', () => {
    it('should store knowledge base entries', () => {
      const stmt = db.db.prepare(`
        INSERT INTO knowledge_base (id, category, title, content)
        VALUES (?, ?, ?, ?)
      `);
      
      const id = uuidv4();
      stmt.run(id, 'faq', 'Password Reset', 'To reset your password...');
      
      const result = db.db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
      expect(result).toBeDefined();
      expect(result.category).toBe('faq');
    });

    it('should track knowledge base usage', () => {
      const stmt = db.db.prepare(`
        INSERT INTO knowledge_base (id, category, title, content, usage_count)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const id = uuidv4();
      stmt.run(id, 'troubleshooting', 'Connection Issues', 'Check your network...', 0);
      
      // Increment usage
      db.db.prepare('UPDATE knowledge_base SET usage_count = usage_count + 1 WHERE id = ?').run(id);
      
      const result = db.db.prepare('SELECT usage_count FROM knowledge_base WHERE id = ?').get(id);
      expect(result.usage_count).toBe(1);
    });

    it('should categorize knowledge base entries', () => {
      const categories = ['faq', 'troubleshooting', 'policies', 'tutorials'];
      
      categories.forEach(category => {
        const id = uuidv4();
        db.db.prepare(`
          INSERT INTO knowledge_base (id, category, title, content)
          VALUES (?, ?, ?, ?)
        `).run(id, category, `${category} title`, `${category} content`);
      });
      
      const faqCount = db.db.prepare('SELECT COUNT(*) as count FROM knowledge_base WHERE category = ?').get('faq');
      expect(faqCount.count).toBeGreaterThan(0);
    });
  });

  describe('Agent Templates', () => {
    it('should store agent templates', () => {
      const stmt = db.db.prepare(`
        INSERT INTO agent_templates (id, name, category, template_content)
        VALUES (?, ?, ?, ?)
      `);
      
      const id = uuidv4();
      const template = 'Thank you for contacting support. {{issue_details}}';
      stmt.run(id, 'support_acknowledgment', 'auto_reply', template);
      
      const result = db.db.prepare('SELECT * FROM agent_templates WHERE id = ?').get(id);
      expect(result).toBeDefined();
      expect(result.template_content).toContain('{{issue_details}}');
    });

    it('should store template variables', () => {
      const variables = JSON.stringify(['customer_name', 'issue_number', 'estimated_time']);
      const stmt = db.db.prepare(`
        INSERT INTO agent_templates (id, name, category, template_content, variables)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const id = uuidv4();
      stmt.run(id, 'escalation_template', 'escalation', 'Escalating {{issue_number}}', variables);
      
      const result = db.db.prepare('SELECT variables FROM agent_templates WHERE id = ?').get(id);
      const parsed = JSON.parse(result.variables);
      expect(parsed).toContain('customer_name');
      expect(parsed).toContain('issue_number');
    });

    it('should enforce unique template names', () => {
      const stmt = db.db.prepare(`
        INSERT INTO agent_templates (id, name, category, template_content)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(uuidv4(), 'unique_template', 'category', 'content');
      
      expect(() => {
        stmt.run(uuidv4(), 'unique_template', 'category', 'different content');
      }).toThrow();
    });
  });
});