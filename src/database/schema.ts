import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { config } from '../config/environment';

export interface EmailMessage {
  id: string;
  messageId: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  githubIssueNumber?: number;
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'processed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
  metadata?: string;
}

export interface GithubIssueMapping {
  id: string;
  issueNumber: number;
  emailThreadId: string;
  emailAlias: string;
  createdAt: Date;
  lastSyncedAt: Date;
}

export interface AgentAction {
  id: string;
  issueNumber: number;
  actionType: 'triage' | 'summarize' | 'intent_detection' | 'auto_reply' | 'escalation';
  confidence: number;
  decision: string;
  reasoning?: string;
  humanApproved?: boolean;
  executedAt?: Date;
  createdAt: Date;
  metadata?: string;
}

export interface RateLimitEntry {
  id: string;
  identifier: string;
  endpoint: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
}

export class Database {
  public db: BetterSqlite3.Database;
  
  constructor() {
    const dbDir = path.dirname(config.database.path);
    require('fs').mkdirSync(dbDir, { recursive: true });
    
    this.db = new BetterSqlite3(config.database.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initializeSchema();
  }
  
  private initializeSchema() {
    // Email Messages Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_messages (
        id TEXT PRIMARY KEY,
        message_id TEXT UNIQUE NOT NULL,
        thread_id TEXT,
        in_reply_to TEXT,
        references TEXT,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        html_body TEXT,
        github_issue_number INTEGER,
        direction TEXT CHECK(direction IN ('inbound', 'outbound')) NOT NULL,
        status TEXT CHECK(status IN ('pending', 'processed', 'failed')) NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_message_id ON email_messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_thread_id ON email_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_github_issue ON email_messages(github_issue_number);
      CREATE INDEX IF NOT EXISTS idx_status ON email_messages(status);
    `);
    
    // GitHub Issue Mapping Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS github_issue_mappings (
        id TEXT PRIMARY KEY,
        issue_number INTEGER UNIQUE NOT NULL,
        email_thread_id TEXT NOT NULL,
        email_alias TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_issue_number ON github_issue_mappings(issue_number);
      CREATE INDEX IF NOT EXISTS idx_thread_id_mapping ON github_issue_mappings(email_thread_id);
    `);
    
    // Agent Actions Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_actions (
        id TEXT PRIMARY KEY,
        issue_number INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        confidence REAL NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT,
        human_approved BOOLEAN,
        executed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        FOREIGN KEY (issue_number) REFERENCES github_issue_mappings(issue_number)
      );
      
      CREATE INDEX IF NOT EXISTS idx_issue_actions ON agent_actions(issue_number);
      CREATE INDEX IF NOT EXISTS idx_action_type ON agent_actions(action_type);
      CREATE INDEX IF NOT EXISTS idx_confidence ON agent_actions(confidence);
    `);
    
    // Rate Limiting Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        window_start DATETIME NOT NULL,
        window_end DATETIME NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limits(identifier, endpoint);
      CREATE INDEX IF NOT EXISTS idx_window_end ON rate_limits(window_end);
    `);
    
    // Knowledge Base Table for Agents
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
      CREATE INDEX IF NOT EXISTS idx_kb_usage ON knowledge_base(usage_count);
    `);
    
    // Agent Templates Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_templates (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        template_content TEXT NOT NULL,
        variables TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_template_category ON agent_templates(category);
    `);
  }
  
  // Email Message Operations
  insertEmailMessage(message: Omit<EmailMessage, 'createdAt'>): EmailMessage {
    const stmt = this.db.prepare(`
      INSERT INTO email_messages (
        id, message_id, thread_id, in_reply_to, references,
        from_email, to_email, subject, body, html_body,
        github_issue_number, direction, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = require('uuid').v4();
    stmt.run(
      id, message.messageId, message.threadId, message.inReplyTo, message.references,
      message.from, message.to, message.subject, message.body, message.htmlBody,
      message.githubIssueNumber, message.direction, message.status, message.metadata
    );
    
    return this.getEmailMessage(id)!;
  }
  
  getEmailMessage(id: string): EmailMessage | null {
    const stmt = this.db.prepare('SELECT * FROM email_messages WHERE id = ?');
    return stmt.get(id) as EmailMessage | null;
  }
  
  getEmailByMessageId(messageId: string): EmailMessage | null {
    const stmt = this.db.prepare('SELECT * FROM email_messages WHERE message_id = ?');
    return stmt.get(messageId) as EmailMessage | null;
  }
  
  updateEmailStatus(id: string, status: 'processed' | 'failed') {
    const stmt = this.db.prepare(`
      UPDATE email_messages 
      SET status = ?, processed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(status, id);
  }
  
  // GitHub Issue Mapping Operations
  createIssueMapping(issueNumber: number, emailThreadId: string): GithubIssueMapping {
    const stmt = this.db.prepare(`
      INSERT INTO github_issue_mappings (id, issue_number, email_thread_id, email_alias)
      VALUES (?, ?, ?, ?)
    `);
    
    const id = require('uuid').v4();
    const emailAlias = `support+issue-${issueNumber}@${config.gmail.domain}`;
    
    stmt.run(id, issueNumber, emailThreadId, emailAlias);
    return this.getIssueMapping(issueNumber)!;
  }
  
  getIssueMapping(issueNumber: number): GithubIssueMapping | null {
    const stmt = this.db.prepare('SELECT * FROM github_issue_mappings WHERE issue_number = ?');
    return stmt.get(issueNumber) as GithubIssueMapping | null;
  }
  
  getIssueMappingByAlias(emailAlias: string): GithubIssueMapping | null {
    const stmt = this.db.prepare('SELECT * FROM github_issue_mappings WHERE email_alias = ?');
    return stmt.get(emailAlias) as GithubIssueMapping | null;
  }
  
  // Agent Action Operations
  recordAgentAction(action: Omit<AgentAction, 'id' | 'createdAt'>): AgentAction {
    const stmt = this.db.prepare(`
      INSERT INTO agent_actions (
        id, issue_number, action_type, confidence, decision,
        reasoning, human_approved, executed_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = require('uuid').v4();
    stmt.run(
      id, action.issueNumber, action.actionType, action.confidence, action.decision,
      action.reasoning, action.humanApproved, action.executedAt, action.metadata
    );
    
    return this.getAgentAction(id)!;
  }
  
  getAgentAction(id: string): AgentAction | null {
    const stmt = this.db.prepare('SELECT * FROM agent_actions WHERE id = ?');
    return stmt.get(id) as AgentAction | null;
  }
  
  getPendingAgentActions(): AgentAction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_actions 
      WHERE human_approved IS NULL AND executed_at IS NULL 
      ORDER BY created_at DESC
    `);
    return stmt.all() as AgentAction[];
  }
  
  approveAgentAction(id: string, approved: boolean) {
    const stmt = this.db.prepare(`
      UPDATE agent_actions 
      SET human_approved = ?, executed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ?
    `);
    stmt.run(approved ? 1 : 0, approved ? 1 : 0, id);
  }
  
  // Rate Limiting Operations
  checkRateLimit(identifier: string, endpoint: string, windowMs: number, maxRequests: number): boolean {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);
    
    // Clean up old entries
    const cleanupStmt = this.db.prepare('DELETE FROM rate_limits WHERE window_end < ?');
    cleanupStmt.run(windowStart.toISOString());
    
    // Check current count
    const countStmt = this.db.prepare(`
      SELECT SUM(count) as total FROM rate_limits 
      WHERE identifier = ? AND endpoint = ? AND window_end > ?
    `);
    const result = countStmt.get(identifier, endpoint, windowStart.toISOString()) as { total: number | null };
    const currentCount = result.total || 0;
    
    if (currentCount >= maxRequests) {
      return false;
    }
    
    // Add new entry
    const insertStmt = this.db.prepare(`
      INSERT INTO rate_limits (id, identifier, endpoint, count, window_start, window_end)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    const windowEnd = new Date(now.getTime() + windowMs);
    insertStmt.run(require('uuid').v4(), identifier, endpoint, now.toISOString(), windowEnd.toISOString());
    
    return true;
  }
  
  close() {
    this.db.close();
  }
}