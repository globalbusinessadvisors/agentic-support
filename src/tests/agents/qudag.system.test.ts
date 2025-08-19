import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TriageAgent,
  SummarizationAgent,
  IntentDetectionAgent,
  AutoReplyAgent,
  QuDAGOrchestrator,
  AgentDecision,
  AgentPolicy
} from '../../agents/qudag.system';

describe('QuDAG Agent System', () => {
  describe('TriageAgent', () => {
    let triageAgent: TriageAgent;

    beforeEach(() => {
      triageAgent = new TriageAgent();
    });

    it('should categorize bug reports', async () => {
      const input = {
        subject: 'Application crashes with error',
        body: 'The app is broken and shows an error message',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);

      expect(decision.action).toBe('triage');
      expect(decision.metadata.categories).toContain('bug');
      expect(decision.confidence).toBeGreaterThan(0.5);
    });

    it('should categorize feature requests', async () => {
      const input = {
        subject: 'Feature request: Dark mode',
        body: 'It would be nice to have a dark mode enhancement',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);

      expect(decision.metadata.categories).toContain('feature-request');
      expect(decision.metadata.priority).toBe('low');
    });

    it('should identify urgent issues', async () => {
      const input = {
        subject: 'URGENT: Production down',
        body: 'Critical issue, need help ASAP',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);

      expect(decision.metadata.categories).toContain('urgent');
      expect(decision.metadata.priority).toBe('high');
      expect(decision.confidence).toBeGreaterThan(0.7);
    });

    it('should categorize questions', async () => {
      const input = {
        subject: 'Question about pricing',
        body: 'How to upgrade my plan? Need help understanding the options.',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);

      expect(decision.metadata.categories).toContain('question');
    });

    it('should handle general inquiries', async () => {
      const input = {
        subject: 'Contact',
        body: 'Hello, I need some information.',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);

      expect(decision.metadata.categories).toContain('general');
      expect(decision.metadata.priority).toBe('normal');
    });

    it('should apply policies to decisions', async () => {
      const policy: AgentPolicy = {
        id: 'test-policy',
        name: 'Test Policy',
        priority: 100,
        enabled: true,
        rules: [{
          condition: 'decision.confidence < 0.5',
          action: 'require_human_approval'
        }]
      };

      triageAgent.addPolicy(policy);

      const input = {
        subject: 'Vague request',
        body: 'Something',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);
      expect(decision.requiresHumanApproval).toBe(true);
    });

    it('should emit decision event', async () => {
      const listener = vi.fn();
      triageAgent.on('decision', listener);

      await triageAgent.process({
        subject: 'Test',
        body: 'Test body',
        from: 'user@test.com'
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'triage'
        })
      );
    });

    it('should handle multiple categories', async () => {
      const input = {
        subject: 'Urgent bug report',
        body: 'Critical error in production, broken functionality',
        from: 'user@test.com'
      };

      const decision = await triageAgent.process(input);

      expect(decision.metadata.categories).toContain('bug');
      expect(decision.metadata.categories).toContain('urgent');
      expect(decision.metadata.priority).toBe('high');
    });
  });

  describe('SummarizationAgent', () => {
    let summarizationAgent: SummarizationAgent;

    beforeEach(() => {
      summarizationAgent = new SummarizationAgent();
    });

    it('should summarize text', async () => {
      const input = {
        text: 'This is a long text that needs to be summarized. It contains multiple sentences. Some are important. Others are not. The summary should be concise.',
        maxLength: 100
      };

      const decision = await summarizationAgent.process(input);

      expect(decision.action).toBe('summarize');
      expect(decision.suggestedResponse).toBeDefined();
      expect(decision.suggestedResponse!.length).toBeLessThanOrEqual(100);
    });

    it('should extract important sentences', async () => {
      const input = {
        text: 'Normal sentence. This is critical and important. Another normal one. This mentions a bug error. Final sentence.'
      };

      const decision = await summarizationAgent.process(input);

      expect(decision.suggestedResponse).toContain('critical');
      expect(decision.confidence).toBeGreaterThan(0.5);
    });

    it('should handle short text', async () => {
      const input = {
        text: 'Short text.',
        maxLength: 200
      };

      const decision = await summarizationAgent.process(input);

      expect(decision.suggestedResponse).toBe('Short text.');
      expect(decision.metadata.originalLength).toBe(11);
    });

    it('should truncate long summaries', async () => {
      const input = {
        text: 'A'.repeat(500),
        maxLength: 50
      };

      const decision = await summarizationAgent.process(input);

      expect(decision.suggestedResponse!.length).toBeLessThanOrEqual(50);
      expect(decision.suggestedResponse).toEndWith('...');
    });

    it('should calculate confidence based on compression ratio', async () => {
      const input = {
        text: 'Test text for summarization. Important details here.',
        maxLength: 200
      };

      const decision = await summarizationAgent.process(input);
      
      expect(decision.confidence).toBeGreaterThan(0.6);
      expect(decision.confidence).toBeLessThan(1);
    });

    it('should not require human approval for summaries', async () => {
      const input = {
        text: 'Text to summarize with multiple sentences here.',
        maxLength: 100
      };

      const decision = await summarizationAgent.process(input);
      expect(decision.requiresHumanApproval).toBe(false);
    });

    it('should track metadata', async () => {
      const text = 'Sample text for testing metadata tracking.';
      const input = { text };

      const decision = await summarizationAgent.process(input);

      expect(decision.metadata.originalLength).toBe(text.length);
      expect(decision.metadata.summaryLength).toBeDefined();
    });
  });

  describe('IntentDetectionAgent', () => {
    let intentAgent: IntentDetectionAgent;

    beforeEach(() => {
      intentAgent = new IntentDetectionAgent();
    });

    it('should detect cancellation intent', async () => {
      const input = { text: 'I want to cancel my subscription' };
      const decision = await intentAgent.process(input);

      expect(decision.action).toBe('route');
      expect(decision.metadata.type).toBe('cancellation');
    });

    it('should detect refund request', async () => {
      const input = { text: 'I need a refund for my purchase' };
      const decision = await intentAgent.process(input);

      expect(decision.metadata.type).toBe('refund_request');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should detect information requests', async () => {
      const input = { text: 'How do I reset my password? What are the steps?' };
      const decision = await intentAgent.process(input);

      expect(decision.metadata.type).toBe('information_request');
    });

    it('should detect bug reports', async () => {
      const input = { text: 'The application is broken and not working properly' };
      const decision = await intentAgent.process(input);

      expect(decision.metadata.type).toBe('bug_report');
    });

    it('should detect feature requests', async () => {
      const input = { text: 'Could you add a dark mode feature? It would be nice to have' };
      const decision = await intentAgent.process(input);

      expect(decision.metadata.type).toBe('feature_request');
    });

    it('should handle general inquiries', async () => {
      const input = { text: 'Hello, I have a question' };
      const decision = await intentAgent.process(input);

      expect(decision.metadata.type).toBe('general_inquiry');
      expect(decision.confidence).toBe(0.5);
    });

    it('should require human approval for low confidence', async () => {
      const input = { text: 'Random text without clear intent' };
      const decision = await intentAgent.process(input);

      expect(decision.metadata.type).toBe('general_inquiry');
      expect(decision.requiresHumanApproval).toBe(true);
    });

    it('should handle mixed intents', async () => {
      const input = { text: 'I want a refund because the feature is broken' };
      const decision = await intentAgent.process(input);

      // Should prioritize refund over bug report
      expect(decision.metadata.type).toBe('refund_request');
    });

    it('should be case insensitive', async () => {
      const input1 = { text: 'CANCEL MY ACCOUNT' };
      const input2 = { text: 'cancel my account' };

      const decision1 = await intentAgent.process(input1);
      const decision2 = await intentAgent.process(input2);

      expect(decision1.metadata.type).toBe('cancellation');
      expect(decision2.metadata.type).toBe('cancellation');
    });
  });

  describe('AutoReplyAgent', () => {
    let autoReplyAgent: AutoReplyAgent;

    beforeEach(() => {
      autoReplyAgent = new AutoReplyAgent();
    });

    it('should generate response from knowledge base', async () => {
      const input = {
        intent: 'password_reset',
        context: { user: 'test@example.com' }
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.action).toBe('auto_reply');
      expect(decision.suggestedResponse).toContain('reset your password');
      expect(decision.confidence).toBe(0.9);
    });

    it('should handle refund policy inquiries', async () => {
      const input = {
        intent: 'refund_policy',
        context: { orderId: '12345' }
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.suggestedResponse).toContain('30 days');
      expect(decision.suggestedResponse).toContain('refund');
    });

    it('should handle technical support requests', async () => {
      const input = {
        intent: 'technical_support',
        context: { issue: 'login error' }
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.suggestedResponse).toContain('Error messages');
      expect(decision.suggestedResponse).toContain('Steps to reproduce');
    });

    it('should generate contextual responses', async () => {
      const input = {
        intent: 'bug_report',
        context: { description: 'App crashes on startup' }
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.action).toBe('auto_reply');
      expect(decision.suggestedResponse).toContain('logged it with our development team');
    });

    it('should escalate unknown intents', async () => {
      const input = {
        intent: 'unknown_intent',
        context: {}
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.action).toBe('escalate');
      expect(decision.confidence).toBe(0.3);
      expect(decision.requiresHumanApproval).toBe(true);
    });

    it('should handle information requests', async () => {
      const input = {
        intent: 'information_request',
        context: { topic: 'pricing' }
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.suggestedResponse).toContain('support team will review');
      expect(decision.suggestedResponse).toContain('24 hours');
    });

    it('should handle feature requests', async () => {
      const input = {
        intent: 'feature_request',
        context: { feature: 'dark mode' }
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.suggestedResponse).toContain('feature suggestion');
      expect(decision.suggestedResponse).toContain('roadmap');
    });

    it('should require approval based on confidence threshold', async () => {
      process.env.CONFIDENCE_THRESHOLD = '0.95';

      const input = {
        intent: 'password_reset',
        context: {}
      };

      const decision = await autoReplyAgent.process(input);

      expect(decision.confidence).toBe(0.9);
      expect(decision.requiresHumanApproval).toBe(true);
    });
  });

  describe('QuDAGOrchestrator', () => {
    let orchestrator: QuDAGOrchestrator;

    beforeEach(() => {
      orchestrator = new QuDAGOrchestrator();
    });

    it('should process complete support request', async () => {
      const request = {
        id: 'req-123',
        subject: 'Urgent bug: Application crashes',
        body: 'The app crashes when I click the save button. This is critical for our workflow.',
        from: 'user@company.com',
        issueNumber: 456
      };

      const result = await orchestrator.processRequest(request);

      expect(result.decisions).toHaveLength(4);
      expect(result.consensus).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
      expect(result.graph).toBeDefined();
    });

    it('should decompose questions properly', async () => {
      const request = {
        id: 'req-456',
        subject: 'Security breach detected',
        body: 'Unauthorized access to account with suspicious activity',
        from: 'security@test.com'
      };

      const result = await orchestrator.processRequest(request);

      const graph = result.graph;
      expect(graph.nodes.size).toBeGreaterThan(5);
      
      // Should include security-specific questions
      const questions = Array.from(graph.nodes.values()).map(n => n.content);
      expect(questions.some(q => q.includes('security'))).toBe(true);
    });

    it('should calculate consensus correctly', async () => {
      const request = {
        id: 'req-789',
        subject: 'Simple question',
        body: 'How do I reset my password?',
        from: 'user@test.com'
      };

      const result = await orchestrator.processRequest(request);

      expect(result.consensus).toBeGreaterThan(0);
      expect(result.consensus).toBeLessThanOrEqual(1);
    });

    it('should recommend escalation for low confidence', async () => {
      const request = {
        id: 'req-low',
        subject: 'Vague issue',
        body: 'Something is wrong',
        from: 'user@test.com'
      };

      const result = await orchestrator.processRequest(request);

      expect(result.consensus).toBeLessThan(0.6);
      expect(result.recommendation).toContain('escalate');
    });

    it('should recommend automation for high confidence', async () => {
      const request = {
        id: 'req-high',
        subject: 'Password reset request',
        body: 'I forgot my password and need to reset it. My account email is user@test.com',
        from: 'user@test.com'
      };

      const result = await orchestrator.processRequest(request);

      expect(result.recommendation).toContain('automated');
    });

    it('should get all agents', () => {
      const agents = orchestrator.getAllAgents();
      
      expect(agents).toHaveLength(4);
      expect(agents.some(a => a['name'] === 'TriageAgent')).toBe(true);
      expect(agents.some(a => a['name'] === 'SummarizationAgent')).toBe(true);
      expect(agents.some(a => a['name'] === 'IntentDetectionAgent')).toBe(true);
      expect(agents.some(a => a['name'] === 'AutoReplyAgent')).toBe(true);
    });

    it('should get specific agent', () => {
      const triageAgent = orchestrator.getAgent('TriageAgent');
      expect(triageAgent).toBeDefined();
      expect(triageAgent!['name']).toBe('TriageAgent');

      const nonExistent = orchestrator.getAgent('NonExistentAgent');
      expect(nonExistent).toBeUndefined();
    });

    it('should handle payment-related requests', async () => {
      const request = {
        id: 'req-payment',
        subject: 'Billing issue',
        body: 'I was charged twice for my subscription payment',
        from: 'customer@test.com'
      };

      const result = await orchestrator.processRequest(request);
      
      const questions = Array.from(result.graph.nodes.values()).map(n => n.content);
      expect(questions.some(q => q.includes('billing'))).toBe(true);
    });

    it('should add context-specific questions for bugs', async () => {
      const request = {
        id: 'req-bug',
        subject: 'Bug report',
        body: 'Found an error in the system',
        from: 'tester@test.com'
      };

      const result = await orchestrator.processRequest(request);
      
      const questions = Array.from(result.graph.nodes.values()).map(n => n.content);
      expect(questions.some(q => q.includes('severity'))).toBe(true);
      expect(questions.some(q => q.includes('reproduce'))).toBe(true);
    });
  });
});