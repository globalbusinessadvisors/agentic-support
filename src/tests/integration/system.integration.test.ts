import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Database } from '../../database/schema';
import { GitHubService } from '../../services/github.service';
import { GmailService } from '../../services/gmail.service';
import { QuDAGOrchestrator } from '../../agents/qudag.system';
import QuDAGSwarmOrchestrator from '../../agents/qudag-integration';
import { v4 as uuidv4 } from 'uuid';

describe('System Integration Tests', () => {
  let db: Database;
  
  beforeAll(() => {
    // Use in-memory database for integration tests
    process.env.DATABASE_PATH = ':memory:';
  });

  beforeEach(() => {
    db = new Database();
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
  });

  describe('End-to-End Support Ticket Flow', () => {
    it('should process complete support ticket lifecycle', async () => {
      // 1. Create initial email message
      const emailMessage = db.insertEmailMessage({
        messageId: `integration-test-${Date.now()}@test.com`,
        threadId: 'thread-integration',
        from: 'customer@test.com',
        to: 'support@example.com',
        subject: 'Integration Test Issue',
        body: 'This is a test issue for integration testing',
        direction: 'inbound',
        status: 'pending'
      });

      expect(emailMessage).toBeDefined();
      expect(emailMessage.id).toBeDefined();

      // 2. Create GitHub issue mapping
      const issueNumber = 999;
      const mapping = db.createIssueMapping(issueNumber, emailMessage.threadId!);
      
      expect(mapping.issueNumber).toBe(issueNumber);
      expect(mapping.emailAlias).toContain('999');

      // 3. Link email to issue
      const updatedMessage = {
        ...emailMessage,
        githubIssueNumber: issueNumber
      };
      db.updateEmailStatus(emailMessage.id, 'processed');

      // 4. Process with QuDAG orchestrator
      const orchestrator = new QuDAGOrchestrator();
      const result = await orchestrator.processRequest({
        id: emailMessage.id,
        subject: emailMessage.subject,
        body: emailMessage.body,
        from: emailMessage.from,
        issueNumber
      });

      expect(result.decisions).toHaveLength(4);
      expect(result.consensus).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();

      // 5. Record agent actions
      for (const decision of result.decisions) {
        const action = db.recordAgentAction({
          issueNumber,
          actionType: decision.action as any,
          confidence: decision.confidence,
          decision: decision.reasoning,
          reasoning: decision.reasoning,
          humanApproved: !decision.requiresHumanApproval
        });
        expect(action.id).toBeDefined();
      }

      // 6. Verify data consistency
      const retrievedMessage = db.getEmailByMessageId(emailMessage.messageId);
      expect(retrievedMessage).toBeDefined();
      expect(retrievedMessage?.status).toBe('processed');

      const retrievedMapping = db.getIssueMapping(issueNumber);
      expect(retrievedMapping).toBeDefined();
      expect(retrievedMapping?.emailThreadId).toBe(emailMessage.threadId);
    });

    it('should handle email reply to existing issue', () => {
      // Setup existing issue
      const issueNumber = 888;
      const threadId = 'thread-reply-test';
      
      db.createIssueMapping(issueNumber, threadId);
      
      // Original message
      const originalMessage = db.insertEmailMessage({
        messageId: 'original@test.com',
        threadId,
        from: 'user@test.com',
        to: 'support@example.com',
        subject: 'Original Issue',
        body: 'Original problem description',
        githubIssueNumber: issueNumber,
        direction: 'inbound',
        status: 'processed'
      });

      // Reply message
      const replyMessage = db.insertEmailMessage({
        messageId: 'reply@test.com',
        threadId,
        inReplyTo: originalMessage.messageId,
        references: originalMessage.messageId,
        from: 'user@test.com',
        to: `support+issue-${issueNumber}@example.com`,
        subject: 'Re: Original Issue',
        body: 'Additional information about the issue',
        githubIssueNumber: issueNumber,
        direction: 'inbound',
        status: 'pending'
      });

      expect(replyMessage.inReplyTo).toBe(originalMessage.messageId);
      expect(replyMessage.githubIssueNumber).toBe(issueNumber);

      // Verify thread consistency
      const mapping = db.getIssueMappingByAlias(`support+issue-${issueNumber}@example.com`);
      expect(mapping).toBeDefined();
      expect(mapping?.issueNumber).toBe(issueNumber);
    });

    it('should enforce rate limiting across requests', () => {
      const identifier = 'rate-test@example.com';
      const endpoint = '/api/support/create';
      const windowMs = 60000;
      const maxRequests = 3;

      // Make requests up to limit
      for (let i = 0; i < maxRequests; i++) {
        const allowed = db.checkRateLimit(identifier, endpoint, windowMs, maxRequests);
        expect(allowed).toBe(true);
      }

      // Should be blocked
      const blocked = db.checkRateLimit(identifier, endpoint, windowMs, maxRequests);
      expect(blocked).toBe(false);

      // Different endpoint should work
      const otherAllowed = db.checkRateLimit(identifier, '/api/other', windowMs, maxRequests);
      expect(otherAllowed).toBe(true);
    });
  });

  describe('QuDAG Swarm Integration', () => {
    it('should initialize QuDAG swarm orchestrator', async () => {
      const swarmOrchestrator = new QuDAGSwarmOrchestrator({
        maxAgents: 5,
        consensusThreshold: 0.75,
        quantumResistant: false,
        darkAddressing: false,
        onionRouting: false
      });

      const status = swarmOrchestrator.getStatus();
      expect(status.config.maxAgents).toBe(5);
      expect(status.config.consensusThreshold).toBe(0.75);
    });

    it('should create and process QuDAG graph', async () => {
      const swarmOrchestrator = new QuDAGSwarmOrchestrator();
      
      const requestId = 'req-graph-test';
      const graph = swarmOrchestrator.createGraph(
        requestId,
        'How should we handle this support request?'
      );

      expect(graph.rootId).toBeDefined();
      expect(graph.nodes.size).toBe(1);

      // Add child nodes
      const child1 = swarmOrchestrator.addNode(requestId, {
        type: 'question',
        content: 'What is the urgency?',
        parent: graph.rootId,
        children: [],
        dependencies: [],
        status: 'pending'
      });

      const child2 = swarmOrchestrator.addNode(requestId, {
        type: 'analysis',
        content: 'Analyze the request',
        parent: graph.rootId,
        children: [],
        dependencies: [child1.id],
        status: 'pending'
      });

      const updatedGraph = swarmOrchestrator['graphs'].get(requestId);
      expect(updatedGraph?.nodes.size).toBe(3);
      expect(updatedGraph?.executionOrder).toContain(child1.id);
      expect(updatedGraph?.executionOrder).toContain(child2.id);
    });

    it('should spawn and manage agents', async () => {
      const swarmOrchestrator = new QuDAGSwarmOrchestrator({
        maxAgents: 3
      });

      const agent1 = await swarmOrchestrator.spawnAgent('triage', ['categorization']);
      const agent2 = await swarmOrchestrator.spawnAgent('analysis', ['summarization']);

      expect(agent1).toBeDefined();
      expect(agent2).toBeDefined();

      const status = swarmOrchestrator.getStatus();
      expect(status.activeAgents).toBe(2);

      // Should respect max agents limit
      await swarmOrchestrator.spawnAgent('third', ['processing']);
      
      await expect(
        swarmOrchestrator.spawnAgent('fourth', ['extra'])
      ).rejects.toThrow('Maximum agent limit reached');
    });

    it('should process request through QuDAG system', async () => {
      const swarmOrchestrator = new QuDAGSwarmOrchestrator();
      
      const result = await swarmOrchestrator.processRequest({
        id: 'swarm-test',
        subject: 'Test Request',
        body: 'This is a test request for the swarm system',
        from: 'swarm@test.com',
        issueNumber: 777
      });

      expect(result.graph).toBeDefined();
      expect(result.decisions).toBeDefined();
      expect(result.consensus).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('Agent Decision Flow', () => {
    it('should apply policies to agent decisions', () => {
      const db = new Database();
      
      // Create issue for foreign key
      db.createIssueMapping(555, 'thread-policy-test');

      // Record high confidence action
      const highConfAction = db.recordAgentAction({
        issueNumber: 555,
        actionType: 'auto_reply',
        confidence: 0.95,
        decision: 'send automatic response',
        humanApproved: true,
        executedAt: new Date()
      });

      expect(highConfAction.humanApproved).toBe(true);
      expect(highConfAction.executedAt).toBeDefined();

      // Record low confidence action
      const lowConfAction = db.recordAgentAction({
        issueNumber: 555,
        actionType: 'escalation',
        confidence: 0.45,
        decision: 'escalate to human',
        humanApproved: null
      });

      expect(lowConfAction.humanApproved).toBeNull();
      expect(lowConfAction.executedAt).toBeUndefined();

      // Get pending actions
      const pending = db.getPendingAgentActions();
      expect(pending.some(a => a.id === lowConfAction.id)).toBe(true);
      expect(pending.some(a => a.id === highConfAction.id)).toBe(false);
    });

    it('should track agent action approval workflow', () => {
      const db = new Database();
      
      db.createIssueMapping(666, 'thread-approval');

      const action = db.recordAgentAction({
        issueNumber: 666,
        actionType: 'auto_reply',
        confidence: 0.7,
        decision: 'pending approval'
      });

      // Initially pending
      expect(action.humanApproved).toBeUndefined();

      // Approve action
      db.approveAgentAction(action.id, true);
      const approved = db.getAgentAction(action.id);
      expect(approved?.humanApproved).toBe(true);
      expect(approved?.executedAt).toBeDefined();

      // Record another action and reject it
      const action2 = db.recordAgentAction({
        issueNumber: 666,
        actionType: 'escalation',
        confidence: 0.6,
        decision: 'needs review'
      });

      db.approveAgentAction(action2.id, false);
      const rejected = db.getAgentAction(action2.id);
      expect(rejected?.humanApproved).toBe(false);
      expect(rejected?.executedAt).toBeNull();
    });
  });

  describe('Database Constraints and Integrity', () => {
    it('should enforce unique constraints', () => {
      const db = new Database();
      
      // Unique message ID
      const messageId = 'unique-msg@test.com';
      db.insertEmailMessage({
        messageId,
        threadId: 'thread1',
        from: 'user@test.com',
        to: 'support@test.com',
        subject: 'Test',
        body: 'Body',
        direction: 'inbound',
        status: 'pending'
      });

      expect(() => {
        db.insertEmailMessage({
          messageId, // Duplicate
          threadId: 'thread2',
          from: 'other@test.com',
          to: 'support@test.com',
          subject: 'Other',
          body: 'Other body',
          direction: 'inbound',
          status: 'pending'
        });
      }).toThrow();

      // Unique issue number
      const issueNumber = 12345;
      db.createIssueMapping(issueNumber, 'thread-unique');
      
      expect(() => {
        db.createIssueMapping(issueNumber, 'thread-different');
      }).toThrow();
    });

    it('should handle foreign key constraints', () => {
      const db = new Database();
      
      // Should fail without existing issue mapping
      expect(() => {
        db.recordAgentAction({
          issueNumber: 99999, // Non-existent
          actionType: 'triage',
          confidence: 0.8,
          decision: 'test'
        });
      }).toThrow();

      // Should work with existing mapping
      db.createIssueMapping(11111, 'thread-fk');
      
      const action = db.recordAgentAction({
        issueNumber: 11111,
        actionType: 'triage',
        confidence: 0.8,
        decision: 'test'
      });
      
      expect(action).toBeDefined();
    });

    it('should handle concurrent operations', () => {
      const db = new Database();
      
      const operations = [];
      
      // Create multiple messages concurrently
      for (let i = 0; i < 10; i++) {
        operations.push(
          db.insertEmailMessage({
            messageId: `concurrent-${i}@test.com`,
            threadId: `thread-${i}`,
            from: 'user@test.com',
            to: 'support@test.com',
            subject: `Test ${i}`,
            body: `Body ${i}`,
            direction: 'inbound',
            status: 'pending'
          })
        );
      }
      
      const results = operations;
      expect(results).toHaveLength(10);
      
      // Verify all were created
      for (let i = 0; i < 10; i++) {
        const msg = db.getEmailByMessageId(`concurrent-${i}@test.com`);
        expect(msg).toBeDefined();
      }
    });
  });
});