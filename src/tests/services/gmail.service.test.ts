import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { GmailService } from '../../services/gmail.service';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

// Mock the dependencies
vi.mock('googleapis');
vi.mock('nodemailer');
vi.mock('imapflow');

describe('GmailService', () => {
  let gmailService: GmailService;
  let mockOAuth2Client: any;
  let mockGmailAPI: any;
  let mockTransporter: any;
  let mockImapClient: any;

  beforeEach(() => {
    // Setup mocks
    mockOAuth2Client = {
      setCredentials: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-access-token' })
    };

    mockGmailAPI = {
      users: {
        messages: {
          list: vi.fn(),
          get: vi.fn(),
          send: vi.fn()
        }
      }
    };

    mockTransporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-message-id' })
    };

    mockImapClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      mailboxOpen: vi.fn().mockResolvedValue(undefined),
      idle: vi.fn().mockResolvedValue(undefined),
      fetchOne: vi.fn(),
      fetch: vi.fn(),
      messageFlagsAdd: vi.fn(),
      on: vi.fn()
    };

    // Mock constructors
    (google.auth.OAuth2 as any) = vi.fn().mockReturnValue(mockOAuth2Client);
    (google.gmail as any) = vi.fn().mockReturnValue(mockGmailAPI);
    (nodemailer.createTransport as Mock).mockReturnValue(mockTransporter);
    (ImapFlow as any).mockImplementation(() => mockImapClient);

    gmailService = new GmailService();
  });

  describe('Initialization', () => {
    it('should initialize OAuth2 client with correct credentials', () => {
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'http://localhost:3000/auth/callback'
      );
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'test-refresh-token'
      });
    });

    it('should initialize IMAP client', async () => {
      await gmailService.initializeImap();
      
      expect(mockOAuth2Client.getAccessToken).toHaveBeenCalled();
      expect(mockImapClient.connect).toHaveBeenCalled();
    });

    it('should handle IMAP connection errors', async () => {
      mockImapClient.connect.mockRejectedValue(new Error('Connection failed'));
      
      await expect(gmailService.initializeImap()).rejects.toThrow('Connection failed');
    });
  });

  describe('Email Sending', () => {
    it('should send email with correct options', async () => {
      const options = {
        to: 'recipient@test.com',
        subject: 'Test Subject',
        text: 'Test body',
        html: '<p>Test body</p>'
      };

      const messageId = await gmailService.sendEmail(options);
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@example.com',
          to: 'recipient@test.com',
          subject: 'Test Subject',
          text: 'Test body',
          html: '<p>Test body</p>'
        })
      );
      expect(messageId).toMatch(/^<\d+\.\d+@example\.com>$/);
    });

    it('should include threading headers', async () => {
      const options = {
        to: 'recipient@test.com',
        subject: 'Re: Original',
        text: 'Reply text',
        inReplyTo: '<original@test.com>',
        references: '<ref1@test.com> <ref2@test.com>'
      };

      await gmailService.sendEmail(options);
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'In-Reply-To': '<original@test.com>',
            'References': '<ref1@test.com> <ref2@test.com>'
          })
        })
      );
    });

    it('should use custom message ID if provided', async () => {
      const customMessageId = '<custom-id@test.com>';
      const options = {
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Body',
        messageId: customMessageId
      };

      const messageId = await gmailService.sendEmail(options);
      
      expect(messageId).toBe(customMessageId);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Message-ID': customMessageId
          })
        })
      );
    });

    it('should handle send email errors', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));
      
      await expect(gmailService.sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        text: 'Body'
      })).rejects.toThrow('SMTP error');
    });

    it('should set reply-to address', async () => {
      const options = {
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Body',
        replyTo: 'support+issue-123@example.com'
      };

      await gmailService.sendEmail(options);
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support+issue-123@example.com'
        })
      );
    });
  });

  describe('Confirmation Emails', () => {
    it('should send confirmation email with correct content', async () => {
      await gmailService.sendConfirmationEmail(
        123,
        'user@test.com',
        'Help with login issue'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: '[Support #123] Help with login issue',
          replyTo: 'support+issue-123@example.com',
          html: expect.stringContaining('#123')
        })
      );
      
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Help with login issue')
        })
      );
    });

    it('should include GitHub issue link', async () => {
      await gmailService.sendConfirmationEmail(456, 'user@test.com', 'Bug report');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('https://github.com/test-owner/test-repo/issues/456')
        })
      );
    });

    it('should use reply-to alias for issue', async () => {
      await gmailService.sendConfirmationEmail(789, 'user@test.com', 'Feature request');

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support+issue-789@example.com'
        })
      );
    });
  });

  describe('Email Watching', () => {
    it('should watch inbox for new messages', async () => {
      const callback = vi.fn();
      const mockMessage = {
        envelope: {
          messageId: 'test-id',
          from: [{ address: 'sender@test.com' }],
          to: [{ address: 'support@test.com' }],
          subject: 'Test Subject',
          date: new Date()
        },
        source: Buffer.from('Message-ID: <test-id>\r\n\r\nBody content')
      };

      mockImapClient.fetchOne.mockResolvedValue(mockMessage);

      await gmailService.watchInbox(callback);

      // Simulate new message event
      const existsHandler = mockImapClient.on.mock.calls.find(
        call => call[0] === 'exists'
      )[1];
      await existsHandler(1);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'test-id',
          from: 'sender@test.com',
          subject: 'Test Subject'
        })
      );
    });

    it('should handle IMAP idle mode', async () => {
      await gmailService.watchInbox(vi.fn());
      
      expect(mockImapClient.mailboxOpen).toHaveBeenCalledWith('INBOX');
      expect(mockImapClient.idle).toHaveBeenCalled();
    });

    it('should parse IMAP message correctly', async () => {
      const callback = vi.fn();
      const rawMessage = `Message-ID: <unique-id@test.com>
In-Reply-To: <parent@test.com>
References: <ref1@test.com> <ref2@test.com>

This is the message body`;

      const mockMessage = {
        envelope: {
          messageId: 'envelope-id',
          from: [{ address: 'from@test.com' }],
          to: [{ address: 'to@test.com' }],
          subject: 'Subject',
          date: new Date(),
          inReplyTo: 'parent@test.com'
        },
        source: Buffer.from(rawMessage)
      };

      mockImapClient.fetchOne.mockResolvedValue(mockMessage);

      await gmailService.watchInbox(callback);

      const existsHandler = mockImapClient.on.mock.calls.find(
        call => call[0] === 'exists'
      )[1];
      await existsHandler(1);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'unique-id@test.com',
          inReplyTo: 'parent@test.com',
          references: '<ref1@test.com> <ref2@test.com>',
          body: expect.stringContaining('This is the message body')
        })
      );
    });
  });

  describe('Fetching Unread Messages', () => {
    it('should fetch unread messages', async () => {
      const mockMessages = [
        {
          seq: 1,
          flags: new Set(),
          envelope: {
            from: [{ address: 'sender1@test.com' }],
            to: [{ address: 'support@test.com' }],
            subject: 'Unread 1',
            date: new Date()
          },
          source: Buffer.from('Body 1')
        },
        {
          seq: 2,
          flags: new Set(['\\Seen']),
          envelope: {
            from: [{ address: 'sender2@test.com' }],
            to: [{ address: 'support@test.com' }],
            subject: 'Read message',
            date: new Date()
          },
          source: Buffer.from('Body 2')
        }
      ];

      mockImapClient.fetch.mockReturnValue(mockMessages[Symbol.iterator]());

      const unread = await gmailService.fetchUnreadMessages();
      
      expect(unread).toHaveLength(1);
      expect(unread[0].subject).toBe('Unread 1');
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(1, ['\\Seen']);
    });

    it('should mark fetched messages as read', async () => {
      const mockMessage = {
        seq: 5,
        flags: new Set(),
        envelope: {
          from: [{ address: 'sender@test.com' }],
          to: [{ address: 'support@test.com' }],
          subject: 'New message',
          date: new Date()
        },
        source: Buffer.from('Content')
      };

      mockImapClient.fetch.mockReturnValue([mockMessage][Symbol.iterator]());

      await gmailService.fetchUnreadMessages();
      
      expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(5, ['\\Seen']);
    });

    it('should handle empty inbox', async () => {
      mockImapClient.fetch.mockReturnValue([][Symbol.iterator]());

      const messages = await gmailService.fetchUnreadMessages();
      
      expect(messages).toHaveLength(0);
      expect(mockImapClient.messageFlagsAdd).not.toHaveBeenCalled();
    });
  });

  describe('Issue Number Extraction', () => {
    it('should extract issue number from alias email', () => {
      const issueNumber = gmailService.extractIssueNumberFromAlias(
        'support+issue-123@example.com'
      );
      expect(issueNumber).toBe(123);
    });

    it('should handle different issue numbers', () => {
      expect(gmailService.extractIssueNumberFromAlias('support+issue-1@example.com')).toBe(1);
      expect(gmailService.extractIssueNumberFromAlias('support+issue-999@example.com')).toBe(999);
      expect(gmailService.extractIssueNumberFromAlias('support+issue-12345@example.com')).toBe(12345);
    });

    it('should return null for non-alias emails', () => {
      expect(gmailService.extractIssueNumberFromAlias('regular@example.com')).toBeNull();
      expect(gmailService.extractIssueNumberFromAlias('support@example.com')).toBeNull();
      expect(gmailService.extractIssueNumberFromAlias('support+other@example.com')).toBeNull();
    });

    it('should handle malformed aliases', () => {
      expect(gmailService.extractIssueNumberFromAlias('support+issue-@example.com')).toBeNull();
      expect(gmailService.extractIssueNumberFromAlias('support+issue-abc@example.com')).toBeNull();
      expect(gmailService.extractIssueNumberFromAlias('support+issue@example.com')).toBeNull();
    });
  });

  describe('Disconnection', () => {
    it('should disconnect IMAP client', async () => {
      await gmailService.initializeImap();
      await gmailService.disconnect();
      
      expect(mockImapClient.logout).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await gmailService.disconnect();
      
      expect(mockImapClient.logout).not.toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      await gmailService.initializeImap();
      mockImapClient.logout.mockRejectedValue(new Error('Logout failed'));
      
      // Should not throw
      await expect(gmailService.disconnect()).resolves.not.toThrow();
    });
  });
});