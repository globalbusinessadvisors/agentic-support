import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubService } from '../../services/github.service';
import { Octokit } from 'octokit';
import crypto from 'crypto';

// Mock Octokit
vi.mock('octokit');

describe('GitHubService', () => {
  let githubService: GitHubService;
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        issues: {
          create: vi.fn(),
          createComment: vi.fn(),
          get: vi.fn(),
          listComments: vi.fn(),
          update: vi.fn()
        }
      }
    };

    (Octokit as any).mockImplementation(() => mockOctokit);
    githubService = new GitHubService();
  });

  describe('Issue Creation', () => {
    it('should create GitHub issue', async () => {
      const mockResponse = {
        data: {
          number: 123,
          title: 'Test Issue',
          body: 'Test body',
          state: 'open',
          user: { login: 'testuser' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          comments: 0
        }
      };

      mockOctokit.rest.issues.create.mockResolvedValue(mockResponse);

      const issue = await githubService.createIssue(
        'Test Issue',
        'Test body',
        ['bug', 'urgent']
      );

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'urgent']
      });

      expect(issue.number).toBe(123);
      expect(issue.title).toBe('Test Issue');
      expect(issue.state).toBe('open');
    });

    it('should handle issue creation without labels', async () => {
      const mockResponse = {
        data: {
          number: 456,
          title: 'No Labels',
          body: 'Body text',
          state: 'open',
          user: { login: 'user' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      };

      mockOctokit.rest.issues.create.mockResolvedValue(mockResponse);

      const issue = await githubService.createIssue('No Labels', 'Body text');

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'No Labels',
        body: 'Body text',
        labels: undefined
      });

      expect(issue.number).toBe(456);
    });

    it('should handle issue creation errors', async () => {
      mockOctokit.rest.issues.create.mockRejectedValue(new Error('API error'));

      await expect(
        githubService.createIssue('Failed Issue', 'Body')
      ).rejects.toThrow('API error');
    });

    it('should handle null body in response', async () => {
      const mockResponse = {
        data: {
          number: 789,
          title: 'Issue',
          body: null,
          state: 'open',
          user: { login: 'user' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      };

      mockOctokit.rest.issues.create.mockResolvedValue(mockResponse);

      const issue = await githubService.createIssue('Issue', 'Body');
      expect(issue.body).toBe('');
    });
  });

  describe('Comment Management', () => {
    it('should add comment to issue', async () => {
      const mockResponse = {
        data: {
          id: 1001,
          body: 'Test comment',
          user: { login: 'commenter' },
          created_at: '2024-01-01T00:00:00Z'
        }
      };

      mockOctokit.rest.issues.createComment.mockResolvedValue(mockResponse);

      const comment = await githubService.addComment(123, 'Test comment');

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: 'Test comment'
      });

      expect(comment.id).toBe(1001);
      expect(comment.body).toBe('Test comment');
      expect(comment.user.login).toBe('commenter');
    });

    it('should handle comment creation errors', async () => {
      mockOctokit.rest.issues.createComment.mockRejectedValue(
        new Error('Comment failed')
      );

      await expect(
        githubService.addComment(123, 'Failed comment')
      ).rejects.toThrow('Comment failed');
    });

    it('should get issue comments', async () => {
      const mockResponse = {
        data: [
          {
            id: 2001,
            body: 'First comment',
            user: { login: 'user1' },
            created_at: '2024-01-01T00:00:00Z'
          },
          {
            id: 2002,
            body: 'Second comment',
            user: { login: 'user2' },
            created_at: '2024-01-01T01:00:00Z'
          }
        ]
      };

      mockOctokit.rest.issues.listComments.mockResolvedValue(mockResponse);

      const comments = await githubService.getIssueComments(456);

      expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 456
      });

      expect(comments).toHaveLength(2);
      expect(comments[0].body).toBe('First comment');
      expect(comments[1].body).toBe('Second comment');
    });

    it('should handle empty comments list', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] });

      const comments = await githubService.getIssueComments(789);
      expect(comments).toHaveLength(0);
    });

    it('should handle null comment bodies', async () => {
      const mockResponse = {
        data: [
          {
            id: 3001,
            body: null,
            user: { login: 'user' },
            created_at: '2024-01-01T00:00:00Z'
          }
        ]
      };

      mockOctokit.rest.issues.listComments.mockResolvedValue(mockResponse);

      const comments = await githubService.getIssueComments(111);
      expect(comments[0].body).toBe('');
    });
  });

  describe('Issue Retrieval', () => {
    it('should get issue by number', async () => {
      const mockResponse = {
        data: {
          number: 234,
          title: 'Retrieved Issue',
          body: 'Issue body',
          state: 'closed',
          user: { login: 'creator' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comments: 5
        }
      };

      mockOctokit.rest.issues.get.mockResolvedValue(mockResponse);

      const issue = await githubService.getIssue(234);

      expect(mockOctokit.rest.issues.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 234
      });

      expect(issue.number).toBe(234);
      expect(issue.state).toBe('closed');
      expect(issue.comments).toBe(5);
    });

    it('should handle issue retrieval errors', async () => {
      mockOctokit.rest.issues.get.mockRejectedValue(new Error('Not found'));

      await expect(githubService.getIssue(999)).rejects.toThrow('Not found');
    });

    it('should handle missing user in issue', async () => {
      const mockResponse = {
        data: {
          number: 345,
          title: 'Issue',
          body: 'Body',
          state: 'open',
          user: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      };

      mockOctokit.rest.issues.get.mockResolvedValue(mockResponse);

      const issue = await githubService.getIssue(345);
      expect(issue.user.login).toBe('unknown');
    });
  });

  describe('Issue Updates', () => {
    it('should update issue', async () => {
      const mockResponse = {
        data: {
          number: 567,
          title: 'Updated Title',
          body: 'Updated body',
          state: 'closed',
          user: { login: 'user' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-03T00:00:00Z',
          comments: 10
        }
      };

      mockOctokit.rest.issues.update.mockResolvedValue(mockResponse);

      const updated = await githubService.updateIssue(567, {
        title: 'Updated Title',
        body: 'Updated body',
        state: 'closed',
        labels: ['resolved']
      });

      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 567,
        title: 'Updated Title',
        body: 'Updated body',
        state: 'closed',
        labels: ['resolved']
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.state).toBe('closed');
    });

    it('should update only specific fields', async () => {
      const mockResponse = {
        data: {
          number: 678,
          title: 'Original',
          body: 'Original body',
          state: 'closed',
          user: { login: 'user' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-03T00:00:00Z'
        }
      };

      mockOctokit.rest.issues.update.mockResolvedValue(mockResponse);

      await githubService.updateIssue(678, { state: 'closed' });

      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 678,
        state: 'closed'
      });
    });

    it('should handle update errors', async () => {
      mockOctokit.rest.issues.update.mockRejectedValue(new Error('Update failed'));

      await expect(
        githubService.updateIssue(789, { title: 'Failed' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid webhook signature', () => {
      const payload = '{"action":"opened"}';
      const secret = 'test-webhook-secret';
      const hmac = crypto.createHmac('sha256', secret);
      const signature = 'sha256=' + hmac.update(payload).digest('hex');

      const isValid = githubService.verifyWebhookSignature(payload, signature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = '{"action":"opened"}';
      const signature = 'sha256=invalid_signature';

      const isValid = githubService.verifyWebhookSignature(payload, signature);
      expect(isValid).toBe(false);
    });

    it('should handle different payload content', () => {
      const payloads = [
        '{"event":"issue"}',
        '{"event":"comment","data":"test"}',
        '[]',
        'plain text'
      ];

      payloads.forEach(payload => {
        const secret = 'test-webhook-secret';
        const hmac = crypto.createHmac('sha256', secret);
        const validSignature = 'sha256=' + hmac.update(payload).digest('hex');
        
        expect(githubService.verifyWebhookSignature(payload, validSignature)).toBe(true);
        expect(githubService.verifyWebhookSignature(payload, 'sha256=wrong')).toBe(false);
      });
    });
  });

  describe('Email Formatting', () => {
    it('should format email reply as GitHub comment', () => {
      const formatted = githubService.formatEmailReplyAsComment(
        'user@example.com',
        'Re: Issue #123',
        'This is my reply to the issue.',
        new Date('2024-01-01T12:00:00Z')
      );

      expect(formatted).toContain('## Email Reply from user@example.com');
      expect(formatted).toContain('**Subject:** Re: Issue #123');
      expect(formatted).toContain('This is my reply to the issue.');
      expect(formatted).toContain('2024-01-01T12:00:00.000Z');
      expect(formatted).toContain('*This comment was automatically added from an email reply.*');
    });

    it('should format comment as email', () => {
      const comment = {
        id: 4001,
        body: 'This is a GitHub comment\nWith multiple lines',
        user: { login: 'githubuser' },
        created_at: '2024-01-01T00:00:00Z'
      };

      const formatted = githubService.formatCommentAsEmail(comment, 'Original Issue Title');

      expect(formatted.subject).toBe('Re: [Support] Original Issue Title');
      expect(formatted.body).toContain('githubuser commented on the issue:');
      expect(formatted.body).toContain('This is a GitHub comment\nWith multiple lines');
      expect(formatted.body).toContain('View on GitHub: https://github.com/test-owner/test-repo/issues/comments/4001');
      
      expect(formatted.html).toContain('<h3>New comment from githubuser</h3>');
      expect(formatted.html).toContain('This is a GitHub comment<br>With multiple lines');
      expect(formatted.html).toContain('<a href="https://github.com/test-owner/test-repo/issues/comments/4001">');
    });

    it('should handle special characters in formatting', () => {
      const comment = {
        id: 5001,
        body: 'Comment with <html> & special "characters"',
        user: { login: 'user' },
        created_at: '2024-01-01T00:00:00Z'
      };

      const formatted = githubService.formatCommentAsEmail(comment, 'Title');
      
      expect(formatted.body).toContain('Comment with <html> & special "characters"');
      expect(formatted.html).toContain('Comment with <html> & special "characters"');
    });

    it('should format empty comment body', () => {
      const comment = {
        id: 6001,
        body: '',
        user: { login: 'emptyuser' },
        created_at: '2024-01-01T00:00:00Z'
      };

      const formatted = githubService.formatCommentAsEmail(comment, 'Issue');
      
      expect(formatted.body).toContain('emptyuser commented on the issue:');
      expect(formatted.html).toContain('New comment from emptyuser');
    });
  });
});