import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { config, validateConfig } from './config/environment';
import supportRoutes from './routes/support.routes';
import emailPollingRoutes from './routes/email-polling.routes';
import { GmailService } from './services/gmail.service';
import { Database } from './database/schema';
import QuDAGSwarmOrchestrator from './agents/qudag-integration';

// Initialize logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: config.logging.filePath,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Initialize services
let gmailService: GmailService;
let db: Database;
let qdagOrchestrator: QuDAGSwarmOrchestrator;

async function initializeServices() {
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize database
    db = new Database();
    logger.info('Database initialized');
    
    // Initialize Gmail service
    gmailService = new GmailService();
    await gmailService.initializeImap();
    logger.info('Gmail service initialized');
    
    // Initialize QuDAG Swarm Orchestrator
    qdagOrchestrator = new QuDAGSwarmOrchestrator({
      maxAgents: 10,
      consensusThreshold: config.agent.confidenceThreshold,
      quantumResistant: false, // Set to true if QuDAG binary is available
      darkAddressing: false,    // Set to true for production
      onionRouting: false       // Set to true for enhanced privacy
    });
    
    // Only initialize QuDAG if binary is available
    try {
      await qdagOrchestrator.initialize();
      logger.info('QuDAG Swarm Orchestrator initialized');
    } catch (error) {
      logger.warn('QuDAG binary not available, running in limited mode');
    }
    
    // Start email polling
    startEmailPolling();
    
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

// Email polling function
async function startEmailPolling() {
  logger.info('Starting email polling service');
  
  // Poll for new emails every 30 seconds
  setInterval(async () => {
    try {
      const messages = await gmailService.fetchUnreadMessages();
      
      for (const message of messages) {
        await processIncomingEmail(message);
      }
      
      if (messages.length > 0) {
        logger.info(`Processed ${messages.length} new emails`);
      }
    } catch (error) {
      logger.error('Error polling emails:', error);
    }
  }, 30000); // 30 seconds
  
  // Also set up real-time IMAP idle listening
  gmailService.watchInbox(async (message) => {
    logger.info('New email received via IMAP IDLE');
    await processIncomingEmail(message);
  });
}

// Process incoming email
async function processIncomingEmail(message: any) {
  try {
    // Check if this is a reply to an existing issue
    const issueNumber = gmailService.extractIssueNumberFromAlias(message.to);
    
    if (issueNumber) {
      // This is a reply to an existing issue
      await handleEmailReply(message, issueNumber);
    } else {
      // This is a new support request
      await createNewSupportTicket(message);
    }
  } catch (error) {
    logger.error('Error processing email:', error);
  }
}

// Handle email reply to existing issue
async function handleEmailReply(message: any, issueNumber: number) {
  const { GitHubService } = require('./services/github.service');
  const githubService = new GitHubService();
  
  // Check for duplicate
  const existing = db.getEmailByMessageId(message.messageId);
  if (existing) {
    logger.info(`Duplicate email detected: ${message.messageId}`);
    return;
  }
  
  // Store email in database
  db.insertEmailMessage({
    messageId: message.messageId,
    threadId: message.threadId,
    inReplyTo: message.inReplyTo,
    references: message.references,
    from: message.from,
    to: message.to,
    subject: message.subject,
    body: message.body,
    htmlBody: message.htmlBody,
    githubIssueNumber: issueNumber,
    direction: 'inbound',
    status: 'pending'
  });
  
  // Add as GitHub comment
  const comment = githubService.formatEmailReplyAsComment(
    message.from,
    message.subject,
    message.body,
    new Date(message.date)
  );
  
  await githubService.addComment(issueNumber, comment);
  
  // Update email status
  db.updateEmailStatus(message.messageId, 'processed');
  
  logger.info(`Added email reply to issue #${issueNumber}`);
}

// Create new support ticket from email
async function createNewSupportTicket(message: any) {
  const { GitHubService } = require('./services/github.service');
  const githubService = new GitHubService();
  
  // Check for duplicate
  const existing = db.getEmailByMessageId(message.messageId);
  if (existing) {
    logger.info(`Duplicate email detected: ${message.messageId}`);
    return;
  }
  
  // Create GitHub issue
  const issueBody = `
**From:** ${message.from}
**Date:** ${new Date(message.date).toISOString()}
**Via:** Email

---

${message.body}

---
*This issue was created from an email sent to ${message.to}*
  `;
  
  const issue = await githubService.createIssue(
    message.subject,
    issueBody,
    ['support', 'email']
  );
  
  // Create database mappings
  const threadId = message.threadId || message.messageId;
  const mapping = db.createIssueMapping(issue.number, threadId);
  
  // Store email in database
  db.insertEmailMessage({
    messageId: message.messageId,
    threadId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    body: message.body,
    htmlBody: message.htmlBody,
    githubIssueNumber: issue.number,
    direction: 'inbound',
    status: 'processed'
  });
  
  // Process with QuDAG orchestrator
  const qdagResult = await qdagOrchestrator.processRequest({
    id: message.messageId,
    subject: message.subject,
    body: message.body,
    from: message.from,
    issueNumber: issue.number
  });
  
  // Add QuDAG analysis as GitHub comment
  const analysisComment = `## 🤖 QuDAG Swarm Analysis

**Consensus Level:** ${(qdagResult.consensus * 100).toFixed(1)}%
**Recommendation:** ${qdagResult.recommendation}

### Decision Graph
- Total Nodes: ${qdagResult.graph.nodes.size}
- Execution Steps: ${qdagResult.graph.executionOrder.length}

### Key Decisions
${qdagResult.decisions.slice(0, 3).map((d: any) => 
  `- ${d.answer || d.summary || d.decision} (Confidence: ${((d.confidence || 0) * 100).toFixed(1)}%)`
).join('\n')}

${qdagResult.consensus < config.agent.confidenceThreshold ? 
  '⚠️ Low consensus - human review recommended' : 
  '✅ High consensus - automated handling approved'}`;
  
  await githubService.addComment(issue.number, analysisComment);
  
  // Send confirmation email
  await gmailService.sendConfirmationEmail(
    issue.number,
    message.from,
    message.subject
  );
  
  logger.info(`Created issue #${issue.number} from email`);
}

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Routes
app.use('/api', supportRoutes);
app.use('/api', emailPollingRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  if (gmailService) {
    await gmailService.disconnect();
  }
  
  if (qdagOrchestrator) {
    await qdagOrchestrator.shutdown();
  }
  
  if (db) {
    db.close();
  }
  
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Support system server running on port ${config.port}`);
      logger.info(`📧 Email: ${config.gmail.supportEmail}`);
      logger.info(`🐙 GitHub: ${config.github.owner}/${config.github.repo}`);
      logger.info(`🤖 Auto-reply: ${config.agent.autoReplyEnabled ? 'Enabled' : 'Disabled'}`);
      logger.info(`👤 Human review: ${config.agent.humanReviewRequired ? 'Required' : 'Optional'}`);
      logger.info(`🎯 Confidence threshold: ${(config.agent.confidenceThreshold * 100).toFixed(0)}%`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export for testing
export { app, startServer };

// Start server if this is the main module
if (require.main === module) {
  startServer();
}