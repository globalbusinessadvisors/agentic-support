import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

describe('Utility Helpers', () => {
  describe('UUID Generation', () => {
    it('should generate valid UUID v4', () => {
      const id = uuidv4();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique UUIDs', () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        ids.add(uuidv4());
      }
      expect(ids.size).toBe(10);
    });
  });

  describe('Email Validation', () => {
    const validateEmail = (email: string): boolean => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    };

    it('should validate correct email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@domain.co.uk')).toBe(true);
      expect(validateEmail('support+issue-123@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user @example.com')).toBe(false);
    });
  });

  describe('Issue Number Extraction', () => {
    const extractIssueNumber = (text: string): number | null => {
      const match = text.match(/#(\d+)/);
      return match ? parseInt(match[1]) : null;
    };

    it('should extract issue numbers from text', () => {
      expect(extractIssueNumber('Fix issue #123')).toBe(123);
      expect(extractIssueNumber('#456: Bug fix')).toBe(456);
      expect(extractIssueNumber('Closes #789 and #101')).toBe(789);
    });

    it('should return null when no issue number found', () => {
      expect(extractIssueNumber('No issue here')).toBeNull();
      expect(extractIssueNumber('Number 123 without hash')).toBeNull();
    });
  });

  describe('Date Formatting', () => {
    const formatDate = (date: Date): string => {
      return date.toISOString().split('T')[0];
    };

    it('should format dates correctly', () => {
      const date = new Date('2024-01-15T12:30:00Z');
      expect(formatDate(date)).toBe('2024-01-15');
    });

    it('should handle different timezones', () => {
      const date = new Date('2024-12-31T23:59:59Z');
      expect(formatDate(date)).toBe('2024-12-31');
    });
  });

  describe('Text Truncation', () => {
    const truncate = (text: string, maxLength: number): string => {
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength - 3) + '...';
    };

    it('should truncate long text', () => {
      const longText = 'This is a very long text that needs to be truncated';
      expect(truncate(longText, 20)).toBe('This is a very lo...');
    });

    it('should not truncate short text', () => {
      const shortText = 'Short';
      expect(truncate(shortText, 20)).toBe('Short');
    });

    it('should handle exact length', () => {
      const text = '12345';
      expect(truncate(text, 5)).toBe('12345');
    });
  });

  describe('Confidence Score Formatting', () => {
    const formatConfidence = (confidence: number): string => {
      const percentage = (confidence * 100).toFixed(1);
      if (confidence >= 0.8) return `High (${percentage}%)`;
      if (confidence >= 0.6) return `Medium (${percentage}%)`;
      return `Low (${percentage}%)`;
    };

    it('should format high confidence', () => {
      expect(formatConfidence(0.95)).toBe('High (95.0%)');
      expect(formatConfidence(0.8)).toBe('High (80.0%)');
    });

    it('should format medium confidence', () => {
      expect(formatConfidence(0.75)).toBe('Medium (75.0%)');
      expect(formatConfidence(0.6)).toBe('Medium (60.0%)');
    });

    it('should format low confidence', () => {
      expect(formatConfidence(0.5)).toBe('Low (50.0%)');
      expect(formatConfidence(0.3)).toBe('Low (30.0%)');
    });
  });

  describe('Priority Mapping', () => {
    const mapPriority = (priority: string): number => {
      const mapping: Record<string, number> = {
        'critical': 1,
        'high': 2,
        'medium': 3,
        'low': 4,
        'normal': 3
      };
      return mapping[priority.toLowerCase()] || 5;
    };

    it('should map priority strings to numbers', () => {
      expect(mapPriority('critical')).toBe(1);
      expect(mapPriority('high')).toBe(2);
      expect(mapPriority('medium')).toBe(3);
      expect(mapPriority('low')).toBe(4);
      expect(mapPriority('normal')).toBe(3);
    });

    it('should handle case insensitive priority', () => {
      expect(mapPriority('CRITICAL')).toBe(1);
      expect(mapPriority('High')).toBe(2);
    });

    it('should default unknown priorities', () => {
      expect(mapPriority('unknown')).toBe(5);
      expect(mapPriority('')).toBe(5);
    });
  });

  describe('Thread ID Generation', () => {
    const generateThreadId = (prefix: string = 'thread'): string => {
      return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    };

    it('should generate thread IDs with prefix', () => {
      const threadId = generateThreadId('email');
      expect(threadId).toMatch(/^email-\d+-[a-z0-9]+$/);
    });

    it('should generate unique thread IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        ids.add(generateThreadId());
      }
      expect(ids.size).toBe(10);
    });

    it('should use default prefix', () => {
      const threadId = generateThreadId();
      expect(threadId).toMatch(/^thread-/);
    });
  });

  describe('Sanitization', () => {
    const sanitizeHtml = (html: string): string => {
      return html
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    };

    it('should sanitize HTML tags', () => {
      expect(sanitizeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should sanitize quotes', () => {
      expect(sanitizeHtml(`"quotes" and 'apostrophes'`))
        .toBe('&quot;quotes&quot; and &#x27;apostrophes&#x27;');
    });

    it('should handle normal text', () => {
      expect(sanitizeHtml('Normal text without HTML'))
        .toBe('Normal text without HTML');
    });
  });

  describe('Retry Logic', () => {
    const retry = async <T>(
      fn: () => Promise<T>,
      maxAttempts: number = 3,
      delay: number = 100
    ): Promise<T> => {
      let lastError: Error | undefined;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError;
    };

    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const result = await retry(async () => {
        attempts++;
        return 'success';
      });
      
      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const result = await retry(async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      });
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts', async () => {
      let attempts = 0;
      
      await expect(retry(async () => {
        attempts++;
        throw new Error('always fails');
      }, 2, 10)).rejects.toThrow('always fails');
      
      expect(attempts).toBe(2);
    });
  });
});