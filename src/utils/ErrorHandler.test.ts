import { describe, it, expect } from 'vitest';
import { ErrorHandler, APIError } from './ErrorHandler';

describe('ErrorHandler', () => {
  it('maps empty LLM response parse errors to AI service error', () => {
    const result = ErrorHandler.handle(
      new Error('Failed to parse JSON from LLM response: empty response'),
      'startCleaning'
    );

    expect(result.title).toBe('AI Service Error');
    expect(result.action).toBe('reconfigure');
    expect(result.recoverable).toBe(true);
    expect(result.message.toLowerCase()).toContain('empty response');
  });

  it('maps oversized prompt errors to actionable message', () => {
    const result = ErrorHandler.handle(
      new Error('Prompt too large (~130000 tokens). Reduce batch size.'),
      'startCleaning'
    );

    expect(result.title).toBe('AI Service Error');
    expect(result.action).toBe('reconfigure');
    expect(result.message.toLowerCase()).toContain('reduce batch size');
  });

  it('maps failed fetch errors to endpoint connectivity hint', () => {
    const result = ErrorHandler.handle(
      new Error('API call failed after 3 attempts: Failed to fetch'),
      'startCleaning'
    );

    expect(result.title).toBe('AI Service Error');
    expect(result.action).toBe('reconfigure');
    expect(result.recoverable).toBe(true);
    expect(result.message.toLowerCase()).toContain('cannot connect');
    expect(result.message.toLowerCase()).toContain('cors');
  });

  it('keeps APIError status mapping behavior', () => {
    const result = ErrorHandler.handle(
      new APIError('Unauthorized', 401),
      'startCleaning'
    );

    expect(result.title).toBe('AI Service Error');
    expect(result.action).toBe('retry');
    expect(result.message.toLowerCase()).toContain('invalid api key');
  });
});
