import { EventEmitter } from 'events';
import winston from 'winston';
import { config } from '../config/environment';
import { v4 as uuidv4 } from 'uuid';

/**
 * QuDAG (Question DAG) and QuDAGG (Question DAG Graph) System
 * Based on Reuven Cohen's hierarchical autonomous agent architecture
 */

export interface QuestionNode {
  id: string;
  question: string;
  type: 'root' | 'analysis' | 'synthesis' | 'action';
  parent?: string;
  children: string[];
  dependencies: string[];
  answer?: any;
  confidence?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: any;
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: any;
  outputSchema?: any;
  confidenceThreshold: number;
}

export interface AgentPolicy {
  id: string;
  name: string;
  rules: PolicyRule[];
  priority: number;
  enabled: boolean;
}

export interface PolicyRule {
  condition: string;
  action: string;
  parameters?: any;
}

export interface AgentDecision {
  action: string;
  confidence: number;
  reasoning: string;
  requiresHumanApproval: boolean;
  suggestedResponse?: string;
  metadata?: any;
}

export abstract class BaseAgent extends EventEmitter {
  protected id: string;
  protected name: string;
  protected capabilities: AgentCapability[];
  protected logger: winston.Logger;
  protected policies: AgentPolicy[];
  
  constructor(name: string, capabilities: AgentCapability[]) {
    super();
    this.id = uuidv4();
    this.name = name;
    this.capabilities = capabilities;
    this.policies = [];
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { agent: name },
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: `agent-${name}.log` })
      ]
    });
  }
  
  abstract async process(input: any): Promise<AgentDecision>;
  
  protected evaluateConfidence(result: any): number {
    // Base confidence evaluation - override in subclasses
    return 0.5;
  }
  
  protected checkPolicies(input: any, decision: AgentDecision): AgentDecision {
    for (const policy of this.policies.filter(p => p.enabled)) {
      for (const rule of policy.rules) {
        if (this.evaluateCondition(rule.condition, input, decision)) {
          decision = this.applyAction(rule.action, decision, rule.parameters);
        }
      }
    }
    return decision;
  }
  
  private evaluateCondition(condition: string, input: any, decision: AgentDecision): boolean {
    // Simple condition evaluator - extend for complex conditions
    try {
      const func = new Function('input', 'decision', `return ${condition}`);
      return func(input, decision);
    } catch (error) {
      this.logger.error(`Error evaluating condition: ${condition}`, error);
      return false;
    }
  }
  
  private applyAction(action: string, decision: AgentDecision, parameters?: any): AgentDecision {
    switch (action) {
      case 'require_human_approval':
        decision.requiresHumanApproval = true;
        break;
      case 'set_confidence':
        decision.confidence = parameters.value;
        break;
      case 'add_metadata':
        decision.metadata = { ...decision.metadata, ...parameters };
        break;
      default:
        this.logger.warn(`Unknown action: ${action}`);
    }
    return decision;
  }
  
  addPolicy(policy: AgentPolicy) {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
  }
}

export class TriageAgent extends BaseAgent {
  constructor() {
    super('TriageAgent', [
      {
        name: 'categorize',
        description: 'Categorize support requests',
        confidenceThreshold: 0.7
      },
      {
        name: 'prioritize',
        description: 'Assign priority levels',
        confidenceThreshold: 0.8
      }
    ]);
  }
  
  async process(input: { subject: string; body: string; from: string }): Promise<AgentDecision> {
    const categories = await this.categorize(input);
    const priority = await this.prioritize(input, categories);
    
    const confidence = this.evaluateConfidence({ categories, priority });
    
    let decision: AgentDecision = {
      action: 'triage',
      confidence,
      reasoning: `Categorized as ${categories.join(', ')} with ${priority} priority`,
      requiresHumanApproval: confidence < config.agent.confidenceThreshold,
      metadata: { categories, priority }
    };
    
    decision = this.checkPolicies(input, decision);
    
    this.logger.info('Triage decision', decision);
    this.emit('decision', decision);
    
    return decision;
  }
  
  private async categorize(input: any): Promise<string[]> {
    const categories = [];
    
    // Simple keyword-based categorization
    const text = `${input.subject} ${input.body}`.toLowerCase();
    
    if (text.includes('bug') || text.includes('error') || text.includes('broken')) {
      categories.push('bug');
    }
    if (text.includes('feature') || text.includes('request') || text.includes('enhancement')) {
      categories.push('feature-request');
    }
    if (text.includes('urgent') || text.includes('critical') || text.includes('asap')) {
      categories.push('urgent');
    }
    if (text.includes('question') || text.includes('how to') || text.includes('help')) {
      categories.push('question');
    }
    
    if (categories.length === 0) {
      categories.push('general');
    }
    
    return categories;
  }
  
  private async prioritize(input: any, categories: string[]): Promise<string> {
    if (categories.includes('urgent')) {
      return 'high';
    }
    if (categories.includes('bug')) {
      return 'medium';
    }
    if (categories.includes('feature-request')) {
      return 'low';
    }
    return 'normal';
  }
  
  protected evaluateConfidence(result: any): number {
    const { categories, priority } = result;
    let confidence = 0.5;
    
    if (categories.length > 0 && categories[0] !== 'general') {
      confidence += 0.2;
    }
    if (priority !== 'normal') {
      confidence += 0.2;
    }
    if (categories.length === 1) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }
}

export class SummarizationAgent extends BaseAgent {
  constructor() {
    super('SummarizationAgent', [
      {
        name: 'summarize',
        description: 'Create concise summaries',
        confidenceThreshold: 0.75
      }
    ]);
  }
  
  async process(input: { text: string; maxLength?: number }): Promise<AgentDecision> {
    const summary = await this.summarize(input.text, input.maxLength || 200);
    const confidence = this.evaluateConfidence({ summary, original: input.text });
    
    let decision: AgentDecision = {
      action: 'summarize',
      confidence,
      reasoning: 'Generated summary of input text',
      requiresHumanApproval: false,
      suggestedResponse: summary,
      metadata: { originalLength: input.text.length, summaryLength: summary.length }
    };
    
    decision = this.checkPolicies(input, decision);
    
    this.logger.info('Summarization complete', decision);
    this.emit('decision', decision);
    
    return decision;
  }
  
  private async summarize(text: string, maxLength: number): Promise<string> {
    // Simple extractive summarization
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const importantSentences = sentences
      .map(s => ({
        text: s.trim(),
        score: this.scoreSentence(s)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.text);
    
    let summary = importantSentences.join(' ');
    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength - 3) + '...';
    }
    
    return summary;
  }
  
  private scoreSentence(sentence: string): number {
    let score = 0;
    const importantWords = ['important', 'critical', 'urgent', 'bug', 'error', 'feature', 'request', 'issue', 'problem'];
    
    for (const word of importantWords) {
      if (sentence.toLowerCase().includes(word)) {
        score += 1;
      }
    }
    
    // Prefer shorter sentences
    score += 1 / (sentence.length / 100);
    
    return score;
  }
  
  protected evaluateConfidence(result: any): number {
    const ratio = result.summaryLength / result.originalLength;
    
    if (ratio < 0.1) return 0.6; // Too short
    if (ratio > 0.5) return 0.7; // Not much reduction
    return 0.85; // Good compression ratio
  }
}

export class IntentDetectionAgent extends BaseAgent {
  constructor() {
    super('IntentDetectionAgent', [
      {
        name: 'detect_intent',
        description: 'Identify user intent',
        confidenceThreshold: 0.8
      }
    ]);
  }
  
  async process(input: { text: string }): Promise<AgentDecision> {
    const intent = await this.detectIntent(input.text);
    const confidence = this.evaluateConfidence(intent);
    
    let decision: AgentDecision = {
      action: 'route',
      confidence,
      reasoning: `Detected intent: ${intent.type}`,
      requiresHumanApproval: confidence < 0.7,
      metadata: intent
    };
    
    decision = this.checkPolicies(input, decision);
    
    this.logger.info('Intent detected', decision);
    this.emit('decision', decision);
    
    return decision;
  }
  
  private async detectIntent(text: string): Promise<any> {
    const lowerText = text.toLowerCase();
    
    // Pattern matching for common intents
    if (lowerText.includes('cancel') || lowerText.includes('unsubscribe')) {
      return { type: 'cancellation', entities: [] };
    }
    
    if (lowerText.includes('refund') || lowerText.includes('money back')) {
      return { type: 'refund_request', entities: [] };
    }
    
    if (lowerText.includes('how') || lowerText.includes('what') || lowerText.includes('where')) {
      return { type: 'information_request', entities: [] };
    }
    
    if (lowerText.includes('bug') || lowerText.includes('broken') || lowerText.includes('not working')) {
      return { type: 'bug_report', entities: [] };
    }
    
    if (lowerText.includes('feature') || lowerText.includes('could you') || lowerText.includes('it would be nice')) {
      return { type: 'feature_request', entities: [] };
    }
    
    return { type: 'general_inquiry', entities: [] };
  }
  
  protected evaluateConfidence(intent: any): number {
    if (intent.type === 'general_inquiry') {
      return 0.5;
    }
    return 0.85;
  }
}

export class AutoReplyAgent extends BaseAgent {
  private knowledgeBase: Map<string, string>;
  
  constructor() {
    super('AutoReplyAgent', [
      {
        name: 'generate_response',
        description: 'Generate automated responses',
        confidenceThreshold: 0.85
      }
    ]);
    
    this.knowledgeBase = new Map();
    this.loadKnowledgeBase();
  }
  
  private loadKnowledgeBase() {
    // Load common Q&A patterns
    this.knowledgeBase.set('password_reset', 'To reset your password, please visit our password reset page at [URL]. Enter your email address and follow the instructions sent to your inbox.');
    this.knowledgeBase.set('refund_policy', 'Our refund policy allows for full refunds within 30 days of purchase. Please provide your order number and reason for the refund request.');
    this.knowledgeBase.set('technical_support', 'For technical issues, please provide: 1) Error messages, 2) Steps to reproduce, 3) Your system information. Our team will investigate promptly.');
  }
  
  async process(input: { intent: string; context: any }): Promise<AgentDecision> {
    const response = await this.generateResponse(input.intent, input.context);
    const confidence = response ? 0.9 : 0.3;
    
    let decision: AgentDecision = {
      action: response ? 'auto_reply' : 'escalate',
      confidence,
      reasoning: response ? 'Found matching response in knowledge base' : 'No suitable response found',
      requiresHumanApproval: !response || confidence < config.agent.confidenceThreshold,
      suggestedResponse: response,
      metadata: { intent: input.intent }
    };
    
    decision = this.checkPolicies(input, decision);
    
    this.logger.info('Auto-reply decision', decision);
    this.emit('decision', decision);
    
    return decision;
  }
  
  private async generateResponse(intent: string, context: any): Promise<string | null> {
    // Check knowledge base for direct match
    if (this.knowledgeBase.has(intent)) {
      return this.knowledgeBase.get(intent)!;
    }
    
    // Generate contextual response based on intent
    switch (intent) {
      case 'information_request':
        return 'Thank you for your inquiry. Our support team will review your question and respond within 24 hours.';
      
      case 'bug_report':
        return 'Thank you for reporting this issue. We have logged it with our development team who will investigate. You can track the progress on this GitHub issue.';
      
      case 'feature_request':
        return 'Thank you for your feature suggestion! We value user feedback and will consider this for our roadmap. The team will review and update this issue with our decision.';
      
      default:
        return null;
    }
  }
}

export class QuDAGOrchestrator extends EventEmitter {
  private agents: Map<string, BaseAgent>;
  private questionGraph: Map<string, QuestionNode>;
  private logger: winston.Logger;
  
  constructor() {
    super();
    this.agents = new Map();
    this.questionGraph = new Map();
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { component: 'QuDAGOrchestrator' },
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'orchestrator.log' })
      ]
    });
    
    this.initializeAgents();
  }
  
  private initializeAgents() {
    const triageAgent = new TriageAgent();
    const summarizationAgent = new SummarizationAgent();
    const intentAgent = new IntentDetectionAgent();
    const autoReplyAgent = new AutoReplyAgent();
    
    // Add default policies
    const humanReviewPolicy: AgentPolicy = {
      id: 'human-review',
      name: 'Human Review Policy',
      priority: 100,
      enabled: config.agent.humanReviewRequired,
      rules: [
        {
          condition: 'decision.confidence < 0.8',
          action: 'require_human_approval'
        }
      ]
    };
    
    [triageAgent, summarizationAgent, intentAgent, autoReplyAgent].forEach(agent => {
      agent.addPolicy(humanReviewPolicy);
      this.agents.set(agent['name'], agent);
    });
  }
  
  async processRequest(input: {
    subject: string;
    body: string;
    from: string;
    issueNumber?: number;
  }): Promise<{
    decisions: AgentDecision[];
    finalAction: string;
    requiresApproval: boolean;
  }> {
    const decisions: AgentDecision[] = [];
    
    // Create root question
    const rootQuestion: QuestionNode = {
      id: uuidv4(),
      question: 'How should this support request be handled?',
      type: 'root',
      children: [],
      dependencies: [],
      status: 'processing'
    };
    this.questionGraph.set(rootQuestion.id, rootQuestion);
    
    // Phase 1: Triage
    const triageAgent = this.agents.get('TriageAgent')!;
    const triageDecision = await triageAgent.process(input);
    decisions.push(triageDecision);
    
    // Phase 2: Intent Detection
    const intentAgent = this.agents.get('IntentDetectionAgent')!;
    const intentDecision = await intentAgent.process({ text: `${input.subject} ${input.body}` });
    decisions.push(intentDecision);
    
    // Phase 3: Summarization
    const summarizationAgent = this.agents.get('SummarizationAgent')!;
    const summaryDecision = await summarizationAgent.process({ text: input.body });
    decisions.push(summaryDecision);
    
    // Phase 4: Auto-reply if appropriate
    if (intentDecision.metadata?.type && config.agent.autoReplyEnabled) {
      const autoReplyAgent = this.agents.get('AutoReplyAgent')!;
      const replyDecision = await autoReplyAgent.process({
        intent: intentDecision.metadata.type,
        context: { ...input, triage: triageDecision.metadata }
      });
      decisions.push(replyDecision);
    }
    
    // Determine final action
    const requiresApproval = decisions.some(d => d.requiresHumanApproval);
    const highestConfidence = Math.max(...decisions.map(d => d.confidence));
    
    let finalAction = 'escalate';
    if (!requiresApproval && highestConfidence > config.agent.confidenceThreshold) {
      const autoReplyDecision = decisions.find(d => d.action === 'auto_reply');
      if (autoReplyDecision && autoReplyDecision.suggestedResponse) {
        finalAction = 'auto_reply';
      }
    }
    
    this.logger.info('Request processed', { 
      issueNumber: input.issueNumber,
      decisionsCount: decisions.length,
      finalAction,
      requiresApproval 
    });
    
    return {
      decisions,
      finalAction,
      requiresApproval
    };
  }
  
  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }
  
  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }
}