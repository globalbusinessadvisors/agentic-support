import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { config } from '../config/environment';
import { EventEmitter } from 'events';
import winston from 'winston';

export interface EmailMessage {
  messageId: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  date: Date;
}

export class GmailService extends EventEmitter {
  private oauth2Client;
  private gmail;
  private transporter;
  private logger: winston.Logger;
  private imapClient?: ImapFlow;
  
  constructor() {
    super();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'gmail.log' })
      ]
    });
    
    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      config.gmail.redirectUri
    );
    
    this.oauth2Client.setCredentials({
      refresh_token: config.gmail.refreshToken
    });
    
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    // Initialize Nodemailer transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: config.gmail.supportEmail,
        clientId: config.gmail.clientId,
        clientSecret: config.gmail.clientSecret,
        refreshToken: config.gmail.refreshToken
      }
    });
  }
  
  async initializeImap() {
    const accessToken = await this.oauth2Client.getAccessToken();
    
    this.imapClient = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: config.gmail.supportEmail,
        accessToken: accessToken.token as string
      }
    });
    
    await this.imapClient.connect();
    this.logger.info('IMAP client connected');
  }
  
  async sendEmail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    messageId?: string;
  }): Promise<string> {
    const messageId = options.messageId || `<${Date.now()}.${Math.random()}@${config.gmail.domain}>`;
    
    const mailOptions = {
      from: config.gmail.supportEmail,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo || config.gmail.supportEmail,
      headers: {
        'Message-ID': messageId,
        ...(options.inReplyTo && { 'In-Reply-To': options.inReplyTo }),
        ...(options.references && { 'References': options.references })
      }
    };
    
    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.info(`Email sent: ${info.messageId}`);
      return messageId;
    } catch (error) {
      this.logger.error('Error sending email:', error);
      throw error;
    }
  }
  
  async sendConfirmationEmail(issueNumber: number, userEmail: string, issueTitle: string): Promise<string> {
    const replyToAlias = `support+issue-${issueNumber}@${config.gmail.domain}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Support Request Received</h2>
        <p>Thank you for contacting our support team. Your request has been received and assigned issue number <strong>#${issueNumber}</strong>.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Issue Title:</strong> ${issueTitle}</p>
          <p><strong>Issue Number:</strong> #${issueNumber}</p>
          <p><strong>Status:</strong> Open</p>
        </div>
        
        <p><strong>To reply to this issue:</strong> Simply reply to this email. Your response will be automatically added to the issue thread.</p>
        
        <p>You can also view and track your issue on GitHub at: https://github.com/${config.github.owner}/${config.github.repo}/issues/${issueNumber}</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message. Replies to this email will be added to your support ticket.
        </p>
      </div>
    `;
    
    return await this.sendEmail({
      to: userEmail,
      subject: `[Support #${issueNumber}] ${issueTitle}`,
      text: `Your support request has been received and assigned issue number #${issueNumber}. Reply to this email to add comments to your issue.`,
      html,
      replyTo: replyToAlias
    });
  }
  
  async watchInbox(callback: (message: EmailMessage) => void) {
    if (!this.imapClient) {
      await this.initializeImap();
    }
    
    await this.imapClient!.mailboxOpen('INBOX');
    
    // Set up idle listening
    this.imapClient!.on('exists', async (count) => {
      this.logger.info(`New message detected, total: ${count}`);
      
      // Fetch the latest message
      const message = await this.imapClient!.fetchOne(String(count), {
        source: true,
        envelope: true,
        bodyStructure: true
      });
      
      if (message) {
        const parsed = await this.parseImapMessage(message);
        callback(parsed);
      }
    });
    
    // Start idling
    await this.imapClient!.idle();
  }
  
  private async parseImapMessage(message: any): Promise<EmailMessage> {
    const envelope = message.envelope;
    const source = message.source.toString();
    
    // Parse headers from source
    const messageIdMatch = source.match(/Message-ID:\s*<([^>]+)>/i);
    const inReplyToMatch = source.match(/In-Reply-To:\s*<([^>]+)>/i);
    const referencesMatch = source.match(/References:\s*(.+)/i);
    
    // Extract body
    const bodyMatch = source.match(/\r\n\r\n([\s\S]*)/);
    const body = bodyMatch ? bodyMatch[1] : '';
    
    return {
      messageId: messageIdMatch ? messageIdMatch[1] : envelope.messageId,
      threadId: envelope.inReplyTo || undefined,
      from: envelope.from[0].address,
      to: envelope.to[0].address,
      subject: envelope.subject,
      body: body,
      inReplyTo: inReplyToMatch ? inReplyToMatch[1] : undefined,
      references: referencesMatch ? referencesMatch[1] : undefined,
      date: new Date(envelope.date)
    };
  }
  
  async fetchUnreadMessages(): Promise<EmailMessage[]> {
    if (!this.imapClient) {
      await this.initializeImap();
    }
    
    await this.imapClient!.mailboxOpen('INBOX');
    
    const messages = [];
    for await (const message of this.imapClient!.fetch('1:*', {
      source: true,
      envelope: true,
      flags: true
    })) {
      if (!message.flags.has('\\Seen')) {
        const parsed = await this.parseImapMessage(message);
        messages.push(parsed);
        
        // Mark as read
        await this.imapClient!.messageFlagsAdd(message.seq, ['\\Seen']);
      }
    }
    
    return messages;
  }
  
  extractIssueNumberFromAlias(email: string): number | null {
    const match = email.match(/support\+issue-(\d+)@/);
    return match ? parseInt(match[1]) : null;
  }
  
  async disconnect() {
    if (this.imapClient) {
      await this.imapClient.logout();
      this.logger.info('IMAP client disconnected');
    }
  }
}