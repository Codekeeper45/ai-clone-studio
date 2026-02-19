import { UserFacingError } from '../types';

export class APIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ErrorHandler {
  static handle(error: unknown, context: string): UserFacingError {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[${context}]`, err);
    return this.mapError(err);
  }

  private static mapError(error: Error): UserFacingError {
    if (this.isAIServiceLikeError(error)) {
      return {
        title: 'AI Service Error',
        message: this.getAIServiceLikeErrorMessage(error.message),
        action: 'reconfigure',
        recoverable: true,
      };
    }

    if (error instanceof APIError) {
      return {
        title: 'AI Service Error',
        message: this.getAPIErrorMessage(error),
        action: 'retry',
        recoverable: true,
      };
    }

    if (error instanceof StorageError) {
      return {
        title: 'Storage Error',
        message: error.message || 'Unable to save data. Try freeing up space.',
        action: 'manage_storage',
        recoverable: true,
      };
    }

    if (error instanceof ParseError) {
      return {
        title: 'File Parsing Error',
        message: error.message || 'Could not parse the uploaded file. Check format.',
        action: 'retry',
        recoverable: true,
      };
    }

    return {
      title: 'Unexpected Error',
      message: error.message || 'An unknown error occurred.',
      action: 'contact_support',
      recoverable: false,
    };
  }

  private static isAIServiceLikeError(error: Error): boolean {
    const message = (error.message || '').toLowerCase();
    const patterns = [
      'api call failed',
      'openai api error',
      'gemini api error',
      'failed to parse json from llm response',
      'empty response content from',
      'invalid response structure from',
      'prompt too large',
      'unsupported provider',
      'cannot reach openai endpoint',
      'network error while requesting',
    ];
    return patterns.some(pattern => message.includes(pattern));
  }

  private static getAIServiceLikeErrorMessage(message: string): string {
    const m = (message || '').toLowerCase();

    if (m.includes('empty response')) {
      return 'The AI provider returned an empty response. Check endpoint/model in Settings and try again.';
    }
    if (m.includes('cannot reach openai endpoint') || m.includes('network error while requesting') || m.includes('failed to fetch')) {
      return 'Cannot connect to the AI endpoint. Verify the endpoint URL, ensure proxy/API is running, and allow CORS for this app origin.';
    }
    if (m.includes('failed to parse json from llm response')) {
      return 'The AI response format is invalid JSON. Try again, reduce batch size, or switch model.';
    }
    if (m.includes('prompt too large')) {
      return 'Request is too large for the selected model. Reduce batch size and retry.';
    }
    if (m.includes('429')) {
      return 'Rate limit exceeded. Wait a moment and retry.';
    }
    if (m.includes('401') || m.includes('403')) {
      return 'Authentication failed. Verify API key and endpoint in Settings.';
    }
    if (m.includes('unsupported provider')) {
      return 'Selected AI provider is not supported. Check provider settings.';
    }

    return message || 'Failed to communicate with the AI service.';
  }

  private static getAPIErrorMessage(error: APIError): string {
    switch (error.status) {
      case 401:
        return 'Invalid API key. Please check your settings.';
      case 429:
        return 'Rate limit exceeded. Please wait a moment and try again.';
      case 403:
        return 'Access denied. Your API key may not have sufficient permissions.';
      case 500:
      case 502:
      case 503:
        return 'AI service is temporarily unavailable. Please try again later.';
      default:
        return error.message || 'Failed to communicate with the AI service.';
    }
  }
}
