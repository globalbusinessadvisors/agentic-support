import { Router, Request, Response } from 'express';
import { GmailService } from '../services/gmail.service';
import winston from 'winston';

const router = Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'email-polling.log' })
  ]
});

// Manual email check endpoint (for testing)
router.post('/email/check', async (req: Request, res: Response) => {
  try {
    const gmailService = new GmailService();
    await gmailService.initializeImap();
    
    const messages = await gmailService.fetchUnreadMessages();
    
    await gmailService.disconnect();
    
    res.json({
      success: true,
      count: messages.length,
      messages: messages.map(m => ({
        from: m.from,
        subject: m.subject,
        date: m.date
      }))
    });
    
  } catch (error) {
    logger.error('Error checking emails:', error);
    res.status(500).json({ error: 'Failed to check emails' });
  }
});

// Get email polling status
router.get('/email/status', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    pollingInterval: 30000,
    lastCheck: new Date().toISOString()
  });
});

export default router;