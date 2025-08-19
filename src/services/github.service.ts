import { Octokit } from 'octokit';
import { config } from '../config/environment';
import winston from 'winston';
import crypto from 'crypto';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    email?: string;
  };
  created_at: string;
  updated_at: string;
  comments?: number;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
}

export class GitHubService {
  private octokit: Octokit;
  private logger: winston.Logger;
  
  constructor() {
    this.octokit = new Octokit({
      auth: config.github.token
    });
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'github.log' })
      ]
    });
  }
  
  async createIssue(title: string, body: string, labels?: string[]): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.create({
        owner: config.github.owner,
        repo: config.github.repo,
        title,
        body,
        labels
      });
      
      this.logger.info(`Created GitHub issue #${response.data.number}`);
      
      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body || '',
        state: response.data.state as 'open' | 'closed',
        user: {
          login: response.data.user?.login || 'unknown',
          email: undefined
        },
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        comments: response.data.comments
      };
    } catch (error) {
      this.logger.error('Error creating GitHub issue:', error);
      throw error;
    }
  }
  
  async addComment(issueNumber: number, body: string): Promise<GitHubComment> {
    try {
      const response = await this.octokit.rest.issues.createComment({
        owner: config.github.owner,
        repo: config.github.repo,
        issue_number: issueNumber,
        body
      });
      
      this.logger.info(`Added comment to issue #${issueNumber}`);
      
      return {
        id: response.data.id,
        body: response.data.body,
        user: {
          login: response.data.user?.login || 'unknown'
        },
        created_at: response.data.created_at
      };
    } catch (error) {
      this.logger.error(`Error adding comment to issue #${issueNumber}:`, error);
      throw error;
    }
  }
  
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.get({
        owner: config.github.owner,
        repo: config.github.repo,
        issue_number: issueNumber
      });
      
      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body || '',
        state: response.data.state as 'open' | 'closed',
        user: {
          login: response.data.user?.login || 'unknown',
          email: undefined
        },
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        comments: response.data.comments
      };
    } catch (error) {
      this.logger.error(`Error fetching issue #${issueNumber}:`, error);
      throw error;
    }
  }
  
  async getIssueComments(issueNumber: number): Promise<GitHubComment[]> {
    try {
      const response = await this.octokit.rest.issues.listComments({
        owner: config.github.owner,
        repo: config.github.repo,
        issue_number: issueNumber
      });
      
      return response.data.map(comment => ({
        id: comment.id,
        body: comment.body || '',
        user: {
          login: comment.user?.login || 'unknown'
        },
        created_at: comment.created_at
      }));
    } catch (error) {
      this.logger.error(`Error fetching comments for issue #${issueNumber}:`, error);
      throw error;
    }
  }
  
  async updateIssue(issueNumber: number, updates: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
  }): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.update({
        owner: config.github.owner,
        repo: config.github.repo,
        issue_number: issueNumber,
        ...updates
      });
      
      this.logger.info(`Updated issue #${issueNumber}`);
      
      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body || '',
        state: response.data.state as 'open' | 'closed',
        user: {
          login: response.data.user?.login || 'unknown',
          email: undefined
        },
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        comments: response.data.comments
      };
    } catch (error) {
      this.logger.error(`Error updating issue #${issueNumber}:`, error);
      throw error;
    }
  }
  
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    // Ensure both buffers have the same length for timing-safe comparison
    const signatureBuffer = Buffer.from(signature);
    const digestBuffer = Buffer.from(digest);
    
    if (signatureBuffer.length !== digestBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  }
  
  formatEmailReplyAsComment(from: string, subject: string, body: string, timestamp: Date): string {
    return `## Email Reply from ${from}

**Subject:** ${subject}
**Date:** ${timestamp.toISOString()}

---

${body}

---
*This comment was automatically added from an email reply.*`;
  }
  
  formatCommentAsEmail(comment: GitHubComment, issueTitle: string): {
    subject: string;
    body: string;
    html: string;
  } {
    const subject = `Re: [Support] ${issueTitle}`;
    
    const body = `${comment.user.login} commented on the issue:

${comment.body}

--
View on GitHub: https://github.com/${config.github.owner}/${config.github.repo}/issues/comments/${comment.id}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h3>New comment from ${comment.user.login}</h3>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          ${comment.body.replace(/\n/g, '<br>')}
        </div>
        <p>
          <a href="https://github.com/${config.github.owner}/${config.github.repo}/issues/comments/${comment.id}">
            View on GitHub
          </a>
        </p>
      </div>
    `;
    
    return { subject, body, html };
  }
}