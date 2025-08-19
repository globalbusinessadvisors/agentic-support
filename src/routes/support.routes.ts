import { Router, Request, Response } from 'express';
import { Database } from '../database/schema';
import { GitHubService } from '../services/github.service';
import { GmailService } from '../services/gmail.service';
import { QuDAGOrchestrator } from '../agents/qudag.system';
import { config } from '../config/environment';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const db = new Database();
const githubService = new GitHubService();
const gmailService = new GmailService();
const orchestrator = new QuDAGOrchestrator();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'routes.log' })
  ]
});

// Public form endpoint to create support ticket
router.post('/support/create', async (req: Request, res: Response) => {
  try {
    const { email, subject, message, name } = req.body;
    
    if (!email || !subject || !message) {
      return res.status(400).json({ error: 'Email, subject, and message are required' });
    }
    
    // Rate limiting check
    const canProceed = db.checkRateLimit(
      email,
      '/support/create',
      config.rateLimit.windowMs,
      config.rateLimit.max
    );
    
    if (!canProceed) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    
    // Create GitHub issue
    const issueBody = `
**From:** ${name || 'Anonymous'} (${email})
**Date:** ${new Date().toISOString()}

---

${message}

---
*This issue was created from a support form submission.*
    `;
    
    const issue = await githubService.createIssue(subject, issueBody, ['support']);
    
    // Create database mappings
    const threadId = uuidv4();
    const mapping = db.createIssueMapping(issue.number, threadId);
    
    // Store initial message in database
    const emailMessage = db.insertEmailMessage({
      messageId: `${threadId}@${config.gmail.domain}`,
      threadId,
      from: email,
      to: config.gmail.supportEmail,
      subject,
      body: message,
      githubIssueNumber: issue.number,
      direction: 'inbound',
      status: 'processed'
    });
    
    // Process with agents
    const agentResult = await orchestrator.processRequest({
      subject,
      body: message,
      from: email,
      issueNumber: issue.number
    });
    
    // Record agent decisions
    for (const decision of agentResult.decisions) {
      db.recordAgentAction({
        issueNumber: issue.number,
        actionType: decision.action as any,
        confidence: decision.confidence,
        decision: decision.reasoning,
        reasoning: decision.reasoning,
        humanApproved: !decision.requiresHumanApproval,
        executedAt: decision.requiresHumanApproval ? undefined : new Date(),
        metadata: JSON.stringify(decision.metadata)
      });
    }
    
    // Add agent analysis as GitHub comment
    const analysisComment = `## 🤖 Automated Analysis

**Triage:** ${agentResult.decisions[0]?.metadata?.categories?.join(', ') || 'General'}
**Priority:** ${agentResult.decisions[0]?.metadata?.priority || 'Normal'}
**Intent:** ${agentResult.decisions[1]?.metadata?.type || 'Unknown'}
**Summary:** ${agentResult.decisions[2]?.suggestedResponse || 'No summary available'}

**Action:** ${agentResult.finalAction}
**Requires Human Review:** ${agentResult.requiresApproval ? 'Yes' : 'No'}

${agentResult.requiresApproval ? '⚠️ This ticket requires human review before automated actions can be taken.' : ''}`;
    
    await githubService.addComment(issue.number, analysisComment);
    
    // Send confirmation email
    const confirmationMessageId = await gmailService.sendConfirmationEmail(
      issue.number,
      email,
      subject
    );
    
    // Handle auto-reply if applicable
    if (agentResult.finalAction === 'auto_reply' && !agentResult.requiresApproval) {
      const autoReplyDecision = agentResult.decisions.find(d => d.action === 'auto_reply');
      if (autoReplyDecision?.suggestedResponse) {
        await gmailService.sendEmail({
          to: email,
          subject: `Re: [Support #${issue.number}] ${subject}`,
          text: autoReplyDecision.suggestedResponse,
          replyTo: mapping.emailAlias,
          inReplyTo: confirmationMessageId,
          references: confirmationMessageId
        });
        
        await githubService.addComment(issue.number, `## 📧 Auto-Reply Sent

${autoReplyDecision.suggestedResponse}

---
*This response was automatically generated with ${(autoReplyDecision.confidence * 100).toFixed(1)}% confidence.*`);
      }
    }
    
    res.json({
      success: true,
      issueNumber: issue.number,
      issueUrl: `https://github.com/${config.github.owner}/${config.github.repo}/issues/${issue.number}`,
      trackingEmail: mapping.emailAlias
    });
    
  } catch (error) {
    logger.error('Error creating support ticket:', error);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

// Webhook endpoint for GitHub issue comments
router.post('/webhooks/github', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload = JSON.stringify(req.body);
    
    // Verify webhook signature
    if (!githubService.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = req.headers['x-github-event'];
    
    if (event === 'issue_comment' && req.body.action === 'created') {
      const { issue, comment } = req.body;
      
      // Skip if comment is from our bot
      if (comment.user.type === 'Bot') {
        return res.json({ status: 'skipped' });
      }
      
      // Get issue mapping
      const mapping = db.getIssueMapping(issue.number);
      if (!mapping) {
        logger.warn(`No mapping found for issue #${issue.number}`);
        return res.json({ status: 'no_mapping' });
      }
      
      // Get original email thread
      const originalMessages = db.db.prepare(
        'SELECT * FROM email_messages WHERE github_issue_number = ? AND direction = ? ORDER BY created_at ASC LIMIT 1'
      ).get(issue.number, 'inbound') as any;
      
      if (originalMessages && originalMessages.from_email) {
        // Format and send email
        const emailContent = githubService.formatCommentAsEmail(comment, issue.title);
        
        await gmailService.sendEmail({
          to: originalMessages.from_email,
          subject: emailContent.subject,
          text: emailContent.body,
          html: emailContent.html,
          replyTo: mapping.emailAlias
        });
        
        logger.info(`Sent GitHub comment to ${originalMessages.from_email} for issue #${issue.number}`);
      }
    }
    
    res.json({ status: 'processed' });
    
  } catch (error) {
    logger.error('Error processing GitHub webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Admin endpoint to review pending agent actions
router.get('/admin/pending-actions', async (req: Request, res: Response) => {
  try {
    const pendingActions = db.getPendingAgentActions();
    res.json(pendingActions);
  } catch (error) {
    logger.error('Error fetching pending actions:', error);
    res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
});

// Admin endpoint to approve/reject agent actions
router.post('/admin/approve-action/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    
    db.approveAgentAction(id, approved);
    
    if (approved) {
      const action = db.getAgentAction(id);
      if (action && action.actionType === 'auto_reply') {
        // Execute the approved auto-reply
        const mapping = db.getIssueMapping(action.issueNumber);
        if (mapping) {
          const originalMessage = db.db.prepare(
            'SELECT * FROM email_messages WHERE github_issue_number = ? LIMIT 1'
          ).get(action.issueNumber) as any;
          
          if (originalMessage) {
            // Send the approved reply
            // Implementation depends on stored metadata
            logger.info(`Executing approved auto-reply for issue #${action.issueNumber}`);
          }
        }
      }
    }
    
    res.json({ success: true, approved });
    
  } catch (error) {
    logger.error('Error approving action:', error);
    res.status(500).json({ error: 'Failed to approve action' });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    config: {
      autoReplyEnabled: config.agent.autoReplyEnabled,
      humanReviewRequired: config.agent.humanReviewRequired,
      confidenceThreshold: config.agent.confidenceThreshold
    }
  });
});

export default router;