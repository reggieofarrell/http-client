import {
  HttpError,
  NetworkError,
  TimeoutError,
  SerializationError,
  HttpErrorCategory,
  classifyHttpError,
  determineHttpErrorRetriability,
  isTimeoutError,
  classifyNetworkErrorType,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
} from '../src/errors';
import type { XiorRequestConfig, XiorResponse } from 'xior';

describe('errors', () => {
  describe('classifyHttpError', () => {
    test('classifies 401 as AUTHENTICATION', () => {
      expect(classifyHttpError(401)).toBe(HttpErrorCategory.AUTHENTICATION);
    });

    test('classifies 403 as AUTHENTICATION', () => {
      expect(classifyHttpError(403)).toBe(HttpErrorCategory.AUTHENTICATION);
    });

    test('classifies 404 as NOT_FOUND', () => {
      expect(classifyHttpError(404)).toBe(HttpErrorCategory.NOT_FOUND);
    });

    test('classifies 429 as RATE_LIMIT', () => {
      expect(classifyHttpError(429)).toBe(HttpErrorCategory.RATE_LIMIT);
    });

    test('classifies 400 as VALIDATION', () => {
      expect(classifyHttpError(400)).toBe(HttpErrorCategory.VALIDATION);
    });

    test('classifies 422 as VALIDATION', () => {
      expect(classifyHttpError(422)).toBe(HttpErrorCategory.VALIDATION);
    });

    test('classifies 418 as CLIENT_ERROR', () => {
      expect(classifyHttpError(418)).toBe(HttpErrorCategory.CLIENT_ERROR);
    });

    test('classifies 500 as SERVER_ERROR', () => {
      expect(classifyHttpError(500)).toBe(HttpErrorCategory.SERVER_ERROR);
    });

    test('classifies 503 as SERVER_ERROR', () => {
      expect(classifyHttpError(503)).toBe(HttpErrorCategory.SERVER_ERROR);
    });

    test('classifies 300 as CLIENT_ERROR (fallback)', () => {
      expect(classifyHttpError(300)).toBe(HttpErrorCategory.CLIENT_ERROR);
    });
  });

  describe('determineHttpErrorRetriability', () => {
    test('returns true for SERVER_ERROR category', () => {
      expect(determineHttpErrorRetriability(500, HttpErrorCategory.SERVER_ERROR)).toBe(true);
    });

    test('returns true for RATE_LIMIT category', () => {
      expect(determineHttpErrorRetriability(429, HttpErrorCategory.RATE_LIMIT)).toBe(true);
    });

    test('returns true for 408 Request Timeout', () => {
      expect(determineHttpErrorRetriability(408, HttpErrorCategory.CLIENT_ERROR)).toBe(true);
    });

    test('returns false for other errors', () => {
      expect(determineHttpErrorRetriability(400, HttpErrorCategory.VALIDATION)).toBe(false);
      expect(determineHttpErrorRetriability(404, HttpErrorCategory.NOT_FOUND)).toBe(false);
      expect(determineHttpErrorRetriability(401, HttpErrorCategory.AUTHENTICATION)).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    test('detects ETIMEDOUT error code', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('detects ESOCKETTIMEDOUT error code', () => {
      const error = { code: 'ESOCKETTIMEDOUT' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('detects timeout in message', () => {
      const error = { message: 'timeout of 5000ms exceeded' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('detects "timed out" in message', () => {
      const error = { message: 'request timed out' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('detects "time out" in message', () => {
      const error = { message: 'time out occurred' };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('detects isTimeout property', () => {
      const error = { isTimeout: true };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('detects __CANCEL__ property', () => {
      const error = { __CANCEL__: true };
      expect(isTimeoutError(error)).toBe(true);
    });

    test('returns false for non-timeout errors', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      expect(isTimeoutError(error)).toBe(false);
    });

    test('handles error without message', () => {
      const error = {};
      expect(isTimeoutError(error)).toBe(false);
    });

    test('handles error with null message', () => {
      const error = { message: null };
      expect(isTimeoutError(error)).toBe(false);
    });
  });

  describe('classifyNetworkErrorType', () => {
    test('classifies ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };
      expect(classifyNetworkErrorType(error)).toBe('connection_refused');
    });

    test('classifies ENOTFOUND', () => {
      const error = { code: 'ENOTFOUND' };
      expect(classifyNetworkErrorType(error)).toBe('dns_lookup_failed');
    });

    test('classifies ECONNRESET', () => {
      const error = { code: 'ECONNRESET' };
      expect(classifyNetworkErrorType(error)).toBe('connection_reset');
    });

    test('classifies ECONNABORTED', () => {
      const error = { code: 'ECONNABORTED' };
      expect(classifyNetworkErrorType(error)).toBe('connection_aborted');
    });

    test('classifies ENETUNREACH', () => {
      const error = { code: 'ENETUNREACH' };
      expect(classifyNetworkErrorType(error)).toBe('network_unreachable');
    });

    test('classifies EHOSTUNREACH', () => {
      const error = { code: 'EHOSTUNREACH' };
      expect(classifyNetworkErrorType(error)).toBe('host_unreachable');
    });

    test('classifies timeout errors', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(classifyNetworkErrorType(error)).toBe('request_timeout');
    });

    test('returns network_error for unknown codes', () => {
      const error = { code: 'UNKNOWN_ERROR' };
      expect(classifyNetworkErrorType(error)).toBe('network_error');
    });

    test('handles error without code', () => {
      const error = {};
      expect(classifyNetworkErrorType(error)).toBe('network_error');
    });
  });

  describe('buildErrorMetadata', () => {
    test('builds metadata with all required fields', () => {
      const config: XiorRequestConfig = {
        method: 'POST',
        url: '/test',
        baseURL: 'https://api.example.com',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      };

      const metadata = buildErrorMetadata(config, 'TestClient', 2);

      expect(metadata.request.method).toBe('POST');
      expect(metadata.request.url).toBe('/test');
      expect(metadata.request.baseURL).toBe('https://api.example.com');
      expect(metadata.request.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(metadata.request.timeout).toBe(5000);
      expect(metadata.request.timestamp).toBeDefined();
      expect(metadata.retryCount).toBe(2);
      expect(metadata.clientName).toBe('TestClient');
    });

    test('builds metadata without optional fields', () => {
      const config: XiorRequestConfig = {
        url: '/test',
        baseURL: 'https://api.example.com',
      };

      const metadata = buildErrorMetadata(config, 'TestClient');

      expect(metadata.request.method).toBe('GET'); // Default method
      expect(metadata.request.url).toBe('/test');
      expect(metadata.request.baseURL).toBe('https://api.example.com');
      expect(metadata.request.headers).toEqual({});
      expect(metadata.request.timeout).toBeUndefined();
      expect(metadata.retryCount).toBeUndefined();
      expect(metadata.clientName).toBe('TestClient');
    });

    test('handles config without timeout', () => {
      const config: XiorRequestConfig = {
        method: 'GET',
        url: '/test',
        baseURL: 'https://api.example.com',
      };

      const metadata = buildErrorMetadata(config, 'TestClient');

      expect(metadata.request.timeout).toBeUndefined();
    });
  });

  describe('buildNetworkErrorMetadata', () => {
    test('builds network error metadata', () => {
      const config: XiorRequestConfig = {
        method: 'GET',
        url: '/test',
        baseURL: 'https://api.example.com',
        headers: {},
      };

      const error = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      const metadata = buildNetworkErrorMetadata(config, 'TestClient', error, 1);

      expect(metadata.request.method).toBe('GET');
      expect(metadata.request.url).toBe('/test');
      expect(metadata.request.baseURL).toBe('https://api.example.com');
      expect(metadata.clientName).toBe('TestClient');
      expect(metadata.retryCount).toBe(1);
      expect(metadata.error.code).toBe('ECONNREFUSED');
      expect(metadata.error.message).toBe('Connection refused');
      expect(metadata.error.type).toBe('connection_refused');
    });

    test('handles error without message', () => {
      const config: XiorRequestConfig = {
        method: 'GET',
        url: '/test',
        baseURL: 'https://api.example.com',
        headers: {},
      };

      const error = { code: 'ECONNREFUSED' };

      const metadata = buildNetworkErrorMetadata(config, 'TestClient', error);

      expect(metadata.error.message).toBe('Unknown error');
    });
  });

  describe('buildHttpErrorResponse', () => {
    test('builds HTTP error response', () => {
      const mockHeaders = new Headers();
      mockHeaders.set('Content-Type', 'application/json');

      const response: XiorResponse = {
        status: 404,
        statusText: 'Not Found',
        headers: mockHeaders,
        data: { message: 'Resource not found' },
        config: {} as any,
        request: {} as any,
        response: {} as any,
      };

      const errorResponse = buildHttpErrorResponse(response);

      expect(errorResponse.status).toBe(404);
      expect(errorResponse.statusText).toBe('Not Found');
      expect(errorResponse.headers).toBeDefined();
      expect(errorResponse.data).toEqual({ message: 'Resource not found' });
    });

    test('handles response without statusText', () => {
      const response: XiorResponse = {
        status: 500,
        statusText: '',
        headers: new Headers(),
        data: {},
        config: {} as any,
        request: {} as any,
        response: {} as any,
      };

      const errorResponse = buildHttpErrorResponse(response);

      expect(errorResponse.statusText).toBe('');
    });

    test('handles response without headers', () => {
      const response: XiorResponse = {
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        data: {},
        config: {} as any,
        request: {} as any,
        response: {} as any,
      };

      const errorResponse = buildHttpErrorResponse(response);

      expect(errorResponse.headers).toBeDefined();
    });
  });

  describe('classifyErrorForRetry', () => {
    test('classifies timeout errors', () => {
      const error = { code: 'ETIMEDOUT' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('timeout');
      expect(classification.isRetriable).toBe(true);
    });

    test('classifies serialization errors', () => {
      const error = { message: 'Unexpected token in JSON', name: 'SyntaxError' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('serialization');
      expect(classification.isRetriable).toBe(false);
    });

    test('classifies HTTP errors with response', () => {
      const error = { response: { status: 404 } };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('http');
      expect(classification.status).toBe(404);
      expect(classification.category).toBe(HttpErrorCategory.NOT_FOUND);
      expect(classification.isRetriable).toBe(false);
    });

    test('classifies network errors with request', () => {
      const error = { request: {} };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('network');
      expect(classification.isRetriable).toBe(true);
    });

    test('classifies unknown errors', () => {
      const error = { message: 'Unknown error' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('unknown');
      expect(classification.isRetriable).toBe(false);
    });
  });

  describe('Error Classes', () => {
    describe('HttpError', () => {
      test('creates HttpError with all properties', () => {
        const response = {
          status: 404,
          statusText: 'Not Found',
          headers: {},
          data: { message: 'Not found' },
        };

        const metadata = {
          request: {
            method: 'GET',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
        };

        const error = new HttpError(
          'Resource not found',
          404,
          HttpErrorCategory.NOT_FOUND,
          'Not Found',
          response,
          metadata
        );

        expect(error.message).toBe('Resource not found');
        expect(error.status).toBe(404);
        expect(error.category).toBe(HttpErrorCategory.NOT_FOUND);
        expect(error.statusText).toBe('Not Found');
        expect(error.response).toBe(response);
        expect(error.code).toBe('HTTP_ERROR');
        expect(error.isRetriable).toBe(false);
        expect(error.metadata).toBe(metadata);
      });

      test('creates HttpError with custom retriability', () => {
        const response = {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          data: {},
        };

        const metadata = {
          request: {
            method: 'GET',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
        };

        const error = new HttpError(
          'Server error',
          500,
          HttpErrorCategory.SERVER_ERROR,
          'Internal Server Error',
          response,
          metadata,
          undefined,
          false // Override default retriability
        );

        expect(error.isRetriable).toBe(false);
      });
    });

    describe('NetworkError', () => {
      test('creates NetworkError with all properties', () => {
        const metadata = {
          request: {
            method: 'GET',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
          error: {
            code: 'ECONNREFUSED',
            message: 'Connection refused',
            type: 'connection_refused',
          },
        };

        const cause = new Error('Original error');
        const error = new NetworkError('Network connection failed', metadata, cause, false);

        expect(error.message).toBe('Network connection failed');
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.isRetriable).toBe(false);
        expect(error.metadata).toBe(metadata);
        expect(error.cause).toBe(cause);
      });

      test('creates NetworkError with default retriability', () => {
        const metadata = {
          request: {
            method: 'GET',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
          error: {
            code: 'ECONNREFUSED',
            message: 'Connection refused',
            type: 'connection_refused',
          },
        };

        const error = new NetworkError('Network connection failed', metadata);

        expect(error.isRetriable).toBe(true); // Default value
      });
    });

    describe('TimeoutError', () => {
      test('creates TimeoutError with all properties', () => {
        const metadata = {
          request: {
            method: 'GET',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
          error: {
            code: 'ETIMEDOUT',
            message: 'Request timeout',
            type: 'request_timeout',
          },
        };

        const cause = new Error('Original timeout');
        const error = new TimeoutError('Request timed out', metadata, cause, false);

        expect(error.message).toBe('Request timed out');
        expect(error.code).toBe('TIMEOUT_ERROR');
        expect(error.isRetriable).toBe(false);
        expect(error.metadata).toBe(metadata);
        expect(error.cause).toBe(cause);
      });
    });

    describe('SerializationError', () => {
      test('creates SerializationError with all properties', () => {
        const metadata = {
          request: {
            method: 'POST',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
        };

        const cause = new Error('JSON parse error');
        const error = new SerializationError('Failed to parse JSON', metadata, cause, true);

        expect(error.message).toBe('Failed to parse JSON');
        expect(error.code).toBe('SERIALIZATION_ERROR');
        expect(error.isRetriable).toBe(true);
        expect(error.metadata).toBe(metadata);
        expect(error.cause).toBe(cause);
      });

      test('creates SerializationError with default retriability', () => {
        const metadata = {
          request: {
            method: 'POST',
            url: '/test',
            baseURL: 'https://api.example.com',
            headers: {},
            timestamp: new Date().toISOString(),
          },
          clientName: 'TestClient',
        };

        const error = new SerializationError('Failed to parse JSON', metadata);

        expect(error.isRetriable).toBe(false); // Default value
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles error classification with different serialization patterns', () => {
      const patterns = [
        { message: 'Invalid JSON', name: 'SyntaxError' },
        { message: 'Unexpected token < in JSON', name: 'TypeError' },
        { message: 'Failed to parse JSON response' },
        { message: 'JSON syntax error' },
        { message: 'Unexpected token in JSON' },
        { message: 'Invalid JSON syntax' },
        { message: 'JSON parse error' },
      ];

      patterns.forEach(error => {
        const classification = classifyErrorForRetry(error);
        expect(classification.type).toBe('serialization');
        expect(classification.isRetriable).toBe(false);
      });
    });

    test('handles error classification with different timeout patterns', () => {
      const patterns = [
        { code: 'ETIMEDOUT' },
        { code: 'ESOCKETTIMEDOUT' },
        { message: 'timeout of 5000ms exceeded' },
        { message: 'request timed out' },
        { message: 'time out occurred' },
        { isTimeout: true },
        { __CANCEL__: true },
      ];

      patterns.forEach(error => {
        const classification = classifyErrorForRetry(error);
        expect(classification.type).toBe('timeout');
        expect(classification.isRetriable).toBe(true);
      });
    });

    test('handles error classification priority (timeout over serialization)', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Unexpected token in JSON',
        name: 'SyntaxError',
      };

      const classification = classifyErrorForRetry(error);
      expect(classification.type).toBe('timeout');
      expect(classification.isRetriable).toBe(true);
    });

    test('handles error classification priority (serialization over network)', () => {
      const error = {
        request: {},
        message: 'Unexpected token in JSON',
        name: 'SyntaxError',
      };

      const classification = classifyErrorForRetry(error);
      expect(classification.type).toBe('serialization');
      expect(classification.isRetriable).toBe(false);
    });
  });
});
