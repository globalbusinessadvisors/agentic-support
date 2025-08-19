import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import request from 'supertest';
import express from 'express';
import supportRoutes from '../../routes/support.routes';
import { Database } from '../../database/schema';
import { GitHubService } from '../../services/github.service';
import { GmailService } from '../../services/gmail.service';
import { QuDAGOrchestrator } from '../../agents/qudag.system';

// Mock all dependencies
vi.mock('../../database/schema');
vi.mock('../../services/github.service');
vi.mock('../../services/gmail.service');
vi.mock('../../agents/qudag.system');

describe('Support Routes', () => {
  let app: express.Express;
  let mockDb: any;
  let mockGitHub: any;
  let mockGmail: any;
  let mockOrchestrator: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', supportRoutes);

    // Setup database mock
    mockDb = {
      checkRateLimit: vi.fn().mockReturnValue(true),
      createIssueMapping: vi.fn().mockReturnValue({
        id: 'mapping-id',
        issueNumber: 123,
        emailThreadId: 'thread-id',
        emailAlias: 'support+issue-123@example.com',
        createdAt: new Date(),
        lastSyncedAt: new Date()
      }),
      insertEmailMessage: vi.fn().mockReturnValue({
        id: 'msg-id',
        messageId: 'message@test.com',
        status: 'processed'
      }),
      recordAgentAction: vi.fn().mockReturnValue({ id: 'action-id' }),
      getEmailByMessageId: vi.fn().mockReturnValue(null),
      getIssueMapping: vi.fn(),
      getIssueMappingByAlias: vi.fn(),
      updateEmailStatus: vi.fn(),
      getPendingAgentActions: vi.fn().mockReturnValue([]),
      getAgentAction: vi.fn(),
      approveAgentAction: vi.fn(),
      close: vi.fn(),
      db: {
        prepare: vi.fn().mockReturnValue({
          get: vi.fn(),
          run: vi.fn()
        })
      }
    };
    (Database as any).mockImplementation(() => mockDb);

    // Setup GitHub mock
    mockGitHub = {
      createIssue: vi.fn().mockResolvedValue({
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        user: { login: 'testuser' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }),
      addComment: vi.fn().mockResolvedValue({
        id: 1,
        body: 'Test comment'
      }),
      verifyWebhookSignature: vi.fn().mockReturnValue(true),
      formatEmailReplyAsComment: vi.fn().mockReturnValue('Formatted comment'),
      formatCommentAsEmail: vi.fn().mockReturnValue({
        subject: 'Re: Issue',
        body: 'Comment body',
        html: '<p>Comment</p>'
      })
    };
    (GitHubService as any).mockImplementation(() => mockGitHub);

    // Setup Gmail mock
    mockGmail = {
      sendConfirmationEmail: vi.fn().mockResolvedValue('msg-id-123'),
      sendEmail: vi.fn().mockResolvedValue('sent-id'),
      extractIssueNumberFromAlias: vi.fn().mockReturnValue(123)
    };
    (GmailService as any).mockImplementation(() => mockGmail);

    // Setup Orchestrator mock
    mockOrchestrator = {
      processRequest: vi.fn().mockResolvedValue({
        decisions: [
          {
            action: 'triage',
            confidence: 0.85,
            reasoning: 'Categorized',
            metadata: { categories: ['bug'], priority: 'high' }
          },
          {
            action: 'intent',
            confidence: 0.9,
            reasoning: 'Intent detected',
            metadata: { type: 'bug_report' }
          },
          {
            action: 'summarize',
            confidence: 0.8,
            reasoning: 'Summarized',
            suggestedResponse: 'Summary text'
          }
        ],
        finalAction: 'auto_reply',
        requiresApproval: false
      })
    };
    (QuDAGOrchestrator as any).mockImplementation(() => mockOrchestrator);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/support/create', () => {
    it('should create support ticket successfully', async () => {
      const response = await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com',
          subject: 'Help needed',
          message: 'I need assistance',
          name: 'John Doe'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        issueNumber: 123,
        issueUrl: 'https://github.com/test-owner/test-repo/issues/123',
        trackingEmail: 'support+issue-123@example.com'
      });

      expect(mockGitHub.createIssue).toHaveBeenCalled();
      expect(mockGmail.sendConfirmationEmail).toHaveBeenCalled();
      expect(mockOrchestrator.processRequest).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com'
          // Missing subject and message
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should enforce rate limiting', async () => {
      mockDb.checkRateLimit.mockReturnValue(false);

      const response = await request(app)
        .post('/api/support/create')
        .send({
          email: 'spammer@test.com',
          subject: 'Spam',
          message: 'Spam message',
          name: 'Spammer'
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many requests');
    });

    it('should handle anonymous submissions', async () => {
      await request(app)
        .post('/api/support/create')
        .send({
          email: 'anon@test.com',
          subject: 'Anonymous issue',
          message: 'No name provided'
          // No name field
        });

      expect(mockGitHub.createIssue).toHaveBeenCalledWith(
        'Anonymous issue',
        expect.stringContaining('Anonymous'),
        ['support']
      );
    });

    it('should record agent actions', async () => {
      await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com',
          subject: 'Test',
          message: 'Test message',
          name: 'User'
        });

      expect(mockDb.recordAgentAction).toHaveBeenCalledTimes(3);
      expect(mockDb.recordAgentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 123,
          actionType: 'triage'
        })
      );
    });

    it('should add agent analysis comment', async () => {
      await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com',
          subject: 'Bug report',
          message: 'Found a bug',
          name: 'Tester'
        });

      expect(mockGitHub.addComment).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Automated Analysis')
      );
    });

    it('should handle auto-reply when enabled', async () => {
      mockOrchestrator.processRequest.mockResolvedValue({
        decisions: [{
          action: 'auto_reply',
          confidence: 0.9,
          suggestedResponse: 'Auto response text',
          requiresHumanApproval: false
        }],
        finalAction: 'auto_reply',
        requiresApproval: false
      });

      await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com',
          subject: 'Question',
          message: 'Need help',
          name: 'User'
        });

      expect(mockGmail.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          text: 'Auto response text'
        })
      );
    });

    it('should skip auto-reply when approval required', async () => {
      mockOrchestrator.processRequest.mockResolvedValue({
        decisions: [{
          action: 'auto_reply',
          confidence: 0.6,
          suggestedResponse: 'Low confidence response',
          requiresHumanApproval: true
        }],
        finalAction: 'escalate',
        requiresApproval: true
      });

      await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com',
          subject: 'Complex issue',
          message: 'Complicated problem',
          name: 'User'
        });

      expect(mockGmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockGitHub.createIssue.mockRejectedValue(new Error('GitHub API error'));

      const response = await request(app)
        .post('/api/support/create')
        .send({
          email: 'user@test.com',
          subject: 'Test',
          message: 'Test message',
          name: 'User'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to create support ticket');
    });
  });

  describe('POST /api/webhooks/github', () => {
    it('should process issue comment webhook', async () => {
      mockDb.getIssueMapping.mockReturnValue({
        issueNumber: 456,
        emailAlias: 'support+issue-456@example.com'
      });

      mockDb.db.prepare().get.mockReturnValue({
        from_email: 'original@test.com'
      });

      const payload = {
        action: 'created',
        issue: {
          number: 456,
          title: 'Issue Title'
        },
        comment: {
          id: 789,
          body: 'Team response',
          user: { login: 'teamuser', type: 'User' }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=valid')
        .set('x-github-event', 'issue_comment')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('processed');
      expect(mockGmail.sendEmail).toHaveBeenCalled();
    });

    it('should verify webhook signature', async () => {
      mockGitHub.verifyWebhookSignature.mockReturnValue(false);

      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=invalid')
        .send({ test: 'data' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid signature');
    });

    it('should skip bot comments', async () => {
      const payload = {
        action: 'created',
        issue: { number: 123 },
        comment: {
          user: { type: 'Bot' }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=valid')
        .set('x-github-event', 'issue_comment')
        .send(payload);

      expect(response.body.status).toBe('skipped');
      expect(mockGmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle missing issue mapping', async () => {
      mockDb.getIssueMapping.mockReturnValue(null);

      const payload = {
        action: 'created',
        issue: { number: 999 },
        comment: {
          user: { type: 'User' }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=valid')
        .set('x-github-event', 'issue_comment')
        .send(payload);

      expect(response.body.status).toBe('no_mapping');
    });

    it('should ignore non-comment events', async () => {
      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=valid')
        .set('x-github-event', 'issues')
        .send({ action: 'opened' });

      expect(response.body.status).toBe('processed');
      expect(mockGmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle webhook errors', async () => {
      mockGitHub.verifyWebhookSignature.mockImplementation(() => {
        throw new Error('Verification error');
      });

      const response = await request(app)
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=any')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Webhook processing failed');
    });
  });

  describe('GET /api/admin/pending-actions', () => {
    it('should return pending actions', async () => {
      const pendingActions = [
        {
          id: 'action-1',
          issueNumber: 100,
          actionType: 'auto_reply',
          confidence: 0.7,
          decision: 'needs review'
        },
        {
          id: 'action-2',
          issueNumber: 101,
          actionType: 'triage',
          confidence: 0.6,
          decision: 'low confidence'
        }
      ];

      mockDb.getPendingAgentActions.mockReturnValue(pendingActions);

      const response = await request(app)
        .get('/api/admin/pending-actions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(pendingActions);
    });

    it('should handle empty pending actions', async () => {
      mockDb.getPendingAgentActions.mockReturnValue([]);

      const response = await request(app)
        .get('/api/admin/pending-actions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockDb.getPendingAgentActions.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/admin/pending-actions');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to fetch pending actions');
    });
  });

  describe('POST /api/admin/approve-action/:id', () => {
    it('should approve action', async () => {
      mockDb.getAgentAction.mockReturnValue({
        id: 'action-123',
        issueNumber: 200,
        actionType: 'auto_reply'
      });

      mockDb.getIssueMapping.mockReturnValue({
        emailAlias: 'support+issue-200@example.com'
      });

      const response = await request(app)
        .post('/api/admin/approve-action/action-123')
        .send({ approved: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        approved: true
      });

      expect(mockDb.approveAgentAction).toHaveBeenCalledWith('action-123', true);
    });

    it('should reject action', async () => {
      const response = await request(app)
        .post('/api/admin/approve-action/action-456')
        .send({ approved: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        approved: false
      });

      expect(mockDb.approveAgentAction).toHaveBeenCalledWith('action-456', false);
    });

    it('should handle approval errors', async () => {
      mockDb.approveAgentAction.mockImplementation(() => {
        throw new Error('Approval failed');
      });

      const response = await request(app)
        .post('/api/admin/approve-action/action-789')
        .send({ approved: true });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to approve action');
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        config: {
          autoReplyEnabled: true,
          humanReviewRequired: true,
          confidenceThreshold: 0.8
        }
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should always return 200 for health check', async () => {
      // Even if other services are down, health endpoint should respond
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
    });
  });
});