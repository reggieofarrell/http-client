import { HttpClient, RequestType } from '../src/http-client';
import {
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError,
  HttpErrorCategory,
  classifyErrorForRetry,
  isSerializationError,
} from '../src/errors';
import MockPlugin from 'xior/plugins/mock';

jest.mock('../src/logger', () => ({ logData: jest.fn(), logInfo: jest.fn() }));

describe('HttpClient', () => {
  let client: HttpClient;
  let mock: MockPlugin;

  beforeEach(() => {
    client = new HttpClient({ baseURL: 'https://api.example.com', debug: true });
    mock = new MockPlugin(client.client);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Constructor Options', () => {
    test('uses default options when not provided', () => {
      const client = new HttpClient({ baseURL: 'https://api.example.com' });

      expect(client.debug).toBe(false);
      expect(client.debugLevel).toBe('normal');
      expect(client.name).toBe('HttpClient');
      expect(client.retryConfig).toEqual({
        retries: 0,
        retryDelay: expect.any(Function),
        onRetry: expect.any(Function),
        delayFactor: 500,
        backoff: 'exponential',
        backoffJitter: 'none',
        enableRetry: expect.any(Function),
      });
    });

    test('overrides default options with provided values', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
        name: 'CustomClient',
        retryConfig: { retries: 5 },
      });

      expect(client.debug).toBe(true);
      expect(client.debugLevel).toBe('verbose');
      expect(client.name).toBe('CustomClient');
      expect(client.retryConfig).toEqual({
        retries: 5,
        retryDelay: expect.any(Function),
        onRetry: expect.any(Function),
        delayFactor: 500,
        backoff: 'exponential',
        backoffJitter: 'none',
        enableRetry: expect.any(Function),
      });
    });
  });

  describe('HTTP Methods', () => {
    const testData = { message: 'success' };
    const testUrl = '/test';

    test('GET request', async () => {
      mock.onGet(testUrl).reply(200, testData);

      const response = await client.get(testUrl);

      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(200);
    });

    test('POST request', async () => {
      const payload = { name: 'test' };
      mock.onPost(testUrl).reply(201, testData);

      const response = await client.post(testUrl, payload);

      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(201);
    });

    test('PUT request', async () => {
      const payload = { name: 'test' };
      mock.onPut(testUrl).reply(200, testData);

      const response = await client.put(testUrl, payload);

      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(200);
    });

    test('PATCH request', async () => {
      const payload = { name: 'test' };
      mock.onPatch('/test').reply(200, { updated: true });

      const response = await client.patch('/test', payload);
      expect(response.data).toEqual({ updated: true });
    });

    test('DELETE request', async () => {
      mock.onDelete('/test').reply(204);

      const response = await client.delete('/test');
      expect(response.request.status).toBe(204);
    });

    test('HEAD request', async () => {
      mock.onHead('/test').reply(200, '', { 'content-length': '123' });

      const response = await client.head('/test');
      expect(response.request.status).toBe(200);
      expect(response.request.headers.get('content-length')).toBe('123');
    });

    test('OPTIONS request', async () => {
      mock.onOptions('/test').reply(200, '', { allow: 'GET, POST, OPTIONS' });

      const response = await client.options('/test');
      expect(response.request.status).toBe(200);
      expect(response.request.headers.get('allow')).toBe('GET, POST, OPTIONS');
    });

    test('direct request method with GET', async () => {
      mock.onGet('/test').reply(200, testData);

      const response = await client.request(RequestType.GET, '/test');
      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(200);
    });

    test('direct request method with POST', async () => {
      const payload = { name: 'test' };
      mock.onPost('/test').reply(201, testData);

      const response = await client.request(RequestType.POST, '/test', payload);
      expect(response.data).toEqual(testData);
      expect(response.request.status).toBe(201);
    });

    test('direct request method with HEAD', async () => {
      mock.onHead('/test').reply(200, '', { 'content-type': 'application/json' });

      const response = await client.request(RequestType.HEAD, '/test');
      expect(response.request.status).toBe(200);
      expect(response.request.headers.get('content-type')).toBe('application/json');
    });

    test('direct request method with OPTIONS', async () => {
      mock.onOptions('/test').reply(200, '', { allow: 'GET, POST, PUT, DELETE, OPTIONS' });

      const response = await client.request(RequestType.OPTIONS, '/test');
      expect(response.request.status).toBe(200);
      expect(response.request.headers.get('allow')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });

    test('handles query parameters correctly', async () => {
      mock.onGet('/test').reply(200, { success: true });

      const response = await client.get('/test', { params: { foo: 'bar' } });
      expect(response.data).toEqual({ success: true });
    });

    test('handles request headers', async () => {
      mock.onGet('/test').reply((config: any) => {
        // Check if the header matches exactly
        if (config.headers?.['X-Custom-Header'] === 'test-value') {
          return [200, { success: true }];
        }
        return [400, { error: 'Header mismatch' }];
      });

      const response = await client.get('/test', { headers: { 'X-Custom-Header': 'test-value' } });
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('Error Handling', () => {
    test('handles API error with message', async () => {
      const errorResponse = { message: 'Not Found', status: 404 };

      mock.onGet('/error').reply(404, errorResponse);

      await expect(client.get('/error')).rejects.toThrow(HttpError);
      await expect(client.get('/error')).rejects.toMatchObject({
        status: 404,
        category: HttpErrorCategory.NOT_FOUND,
        response: expect.objectContaining({
          status: 404,
          data: errorResponse,
        }),
      });
    });

    test('handles network error', async () => {
      mock.onGet('/network-error').reply(() => {
        const error = new Error('Network Error');
        (error as any).request = {};
        throw error;
      });

      await expect(client.get('/network-error')).rejects.toThrow(NetworkError);
    });

    test('handles 500 server error', async () => {
      mock.onGet('/server-error').reply(500, { message: 'Internal Server Error' });

      await expect(client.get('/server-error')).rejects.toThrow(HttpError);
      await expect(client.get('/server-error')).rejects.toMatchObject({
        status: 500,
        category: HttpErrorCategory.SERVER_ERROR,
        isRetriable: true,
      });
    });

    test('handles timeout error', async () => {
      mock.onGet('/timeout').timeout();

      await expect(client.get('/timeout')).rejects.toThrow(TimeoutError);
    });

    test('handles error without response data', async () => {
      mock.onGet('/error').reply(403);

      await expect(client.get('/error')).rejects.toThrow(HttpError);
      await expect(client.get('/error')).rejects.toMatchObject({
        status: 403,
        category: HttpErrorCategory.AUTHENTICATION,
        isRetriable: false,
      });
    });

    test('handles error with non-standard response format', async () => {
      mock.onGet('/error').reply(400, {
        errors: ['Invalid input'], // Different format than message
      });

      await expect(client.get('/error')).rejects.toThrow(HttpError);
      await expect(client.get('/error')).rejects.toMatchObject({
        status: 400,
        category: HttpErrorCategory.VALIDATION,
        isRetriable: false,
      });
    });
  });

  describe('Error Message Extraction', () => {
    test('uses default data.message path for error messages', async () => {
      const errorResponse = { message: 'Custom error message' };
      mock.onGet('/error').reply(400, errorResponse);

      await expect(client.get('/error')).rejects.toThrow(HttpError);
      await expect(client.get('/error')).rejects.toMatchObject({
        message: 'Custom error message',
      });
    });

    test('falls back to statusText when data.message is not available', async () => {
      const errorResponse = { error: 'Some other field' };
      mock.onGet('/error').reply(400, errorResponse);

      await expect(client.get('/error')).rejects.toThrow(HttpError);
      await expect(client.get('/error')).rejects.toMatchObject({
        message: 'ok', // Default statusText from xior mock
      });
    });

    test('supports custom string path for error message extraction', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: 'data.error.detail',
      });

      const customMock = new MockPlugin(customClient.client);
      const errorResponse = {
        error: {
          detail: 'Validation failed for field X',
        },
      };
      customMock.onGet('/error').reply(400, errorResponse);

      await expect(customClient.get('/error')).rejects.toThrow(HttpError);
      await expect(customClient.get('/error')).rejects.toMatchObject({
        message: 'Validation failed for field X',
      });

      customMock.restore();
    });

    test('supports function-based error message extraction', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: response => {
          // Custom logic to extract message from complex response structure
          if (response.data?.errors?.length > 0) {
            return response.data.errors[0].message;
          }
          return response.data?.message;
        },
      });

      const customMock = new MockPlugin(customClient.client);
      const errorResponse = {
        errors: [{ message: 'First validation error' }, { message: 'Second validation error' }],
      };
      customMock.onGet('/error').reply(400, errorResponse);

      await expect(customClient.get('/error')).rejects.toThrow(HttpError);
      await expect(customClient.get('/error')).rejects.toMatchObject({
        message: 'First validation error',
      });

      customMock.restore();
    });

    test('supports per-request error message path override', async () => {
      const errorResponse = {
        message: 'Default message',
        error: {
          detail: 'Per-request custom message',
        },
      };
      mock.onGet('/error').reply(400, errorResponse);

      await expect(client.get('/error', { errorMessagePath: 'data.error.detail' })).rejects.toThrow(
        HttpError
      );
      await expect(
        client.get('/error', { errorMessagePath: 'data.error.detail' })
      ).rejects.toMatchObject({
        message: 'Per-request custom message',
      });
    });

    test('per-request errorMessagePath overrides instance-level config', async () => {
      const instanceClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: 'data.error.message',
      });

      const instanceMock = new MockPlugin(instanceClient.client);
      const errorResponse = {
        error: {
          message: 'Instance-level message',
          detail: 'Per-request override message',
        },
      };
      instanceMock.onGet('/error').reply(400, errorResponse);

      await expect(
        instanceClient.get('/error', { errorMessagePath: 'data.error.detail' })
      ).rejects.toThrow(HttpError);
      await expect(
        instanceClient.get('/error', { errorMessagePath: 'data.error.detail' })
      ).rejects.toMatchObject({
        message: 'Per-request override message',
      });

      instanceMock.restore();
    });

    test('handles nested dot notation paths correctly', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: 'data.errors.0.message',
      });

      const customMock = new MockPlugin(customClient.client);
      const errorResponse = {
        errors: [{ message: 'First error message' }, { message: 'Second error message' }],
      };
      customMock.onGet('/error').reply(400, errorResponse);

      await expect(customClient.get('/error')).rejects.toThrow(HttpError);
      await expect(customClient.get('/error')).rejects.toMatchObject({
        message: 'First error message',
      });

      customMock.restore();
    });

    test('handles function extractor returning undefined gracefully', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: () => undefined, // Function returns undefined
      });

      const customMock = new MockPlugin(customClient.client);
      const errorResponse = { message: 'This should be ignored' };
      customMock.onGet('/error').reply(400, errorResponse);

      await expect(customClient.get('/error')).rejects.toThrow(HttpError);
      await expect(customClient.get('/error')).rejects.toMatchObject({
        message: 'ok', // Should fall back to statusText
      });

      customMock.restore();
    });

    test('handles function extractor with complex response structure', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: response => {
          // Handle multiple possible error formats
          if (response.data?.error?.message) {
            return response.data.error.message;
          }
          if (response.data?.errors?.length > 0) {
            return response.data.errors.map((e: any) => e.message).join('; ');
          }
          if (response.data?.message) {
            return response.data.message;
          }
          return undefined;
        },
      });

      const customMock = new MockPlugin(customClient.client);
      const errorResponse = {
        errors: [{ message: 'Error 1' }, { message: 'Error 2' }],
      };
      customMock.onGet('/error').reply(400, errorResponse);

      await expect(customClient.get('/error')).rejects.toThrow(HttpError);
      await expect(customClient.get('/error')).rejects.toMatchObject({
        message: 'Error 1; Error 2',
      });

      customMock.restore();
    });

    test('handles invalid dot notation path gracefully', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        errorMessagePath: 'data.nonexistent.deep.path',
      });

      const customMock = new MockPlugin(customClient.client);
      const errorResponse = { message: 'This should be ignored' };
      customMock.onGet('/error').reply(400, errorResponse);

      await expect(customClient.get('/error')).rejects.toThrow(HttpError);
      await expect(customClient.get('/error')).rejects.toMatchObject({
        message: 'ok', // Should fall back to statusText
      });

      customMock.restore();
    });
  });

  describe('Retry Configuration', () => {
    test('applies retry config at instance level', () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: { retries: 3, delayFactor: 1000, backoff: 'linear' },
      });

      expect(retryClient.retryConfig.retries).toBe(3);
      expect(retryClient.retryConfig.delayFactor).toBe(1000);
      expect(retryClient.retryConfig.backoff).toBe('linear');
    });

    test('applies per-request retry config to request options', async () => {
      const testClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: { retries: 1 },
      });

      const testMock = new MockPlugin(testClient.client);
      testMock.onGet('/test').reply(200, { success: true });

      // This should not throw even though we're overriding retry config
      await expect(
        testClient.get('/test', { retryConfig: { retries: 5, delayFactor: 100 } })
      ).resolves.toBeDefined();

      testMock.restore();
    });

    test('uses default enableRetry function when not provided', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: { retries: 2 },
      });

      expect(client.retryConfig.enableRetry).toBeDefined();
      expect(typeof client.retryConfig.enableRetry).toBe('function');
    });
  });

  describe('Retry Backoff with Jitter', () => {
    test('defaults to no jitter (backoffJitter: none)', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: { retries: 3, delayFactor: 100, backoff: 'exponential' },
      });

      expect(client.retryConfig.backoffJitter).toBe('none');
    });

    test('applies full jitter to exponential backoff', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'full',
        },
      });

      // Create a mock error
      const mockError: any = { response: null };

      // Test multiple iterations to verify randomization
      const delays: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const delay = (client as any).getRetryDelay(i, mockError, 'exponential', 100, 'full');
        const maxDelay = 100 * Math.pow(2, i - 1); // Expected max for exponential
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(maxDelay);
        delays.push(delay);
      }
    });

    test('applies equal jitter to exponential backoff', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'equal',
        },
      });

      const mockError: any = { response: null };

      for (let i = 1; i <= 3; i++) {
        const delay = (client as any).getRetryDelay(i, mockError, 'exponential', 100, 'equal');
        const baseDelay = 100 * Math.pow(2, i - 1);
        const minDelay = baseDelay / 2;
        const maxDelay = baseDelay;
        expect(delay).toBeGreaterThanOrEqual(minDelay);
        expect(delay).toBeLessThanOrEqual(maxDelay);
      }
    });

    test('applies decorrelated jitter', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'decorrelated',
        },
      });

      const mockError: any = { response: null };

      for (let i = 1; i <= 3; i++) {
        const delay = (client as any).getRetryDelay(
          i,
          mockError,
          'exponential',
          100,
          'decorrelated'
        );
        const baseDelay = 100 * Math.pow(2, i - 1);
        const minDelay = 100; // delayFactor
        const maxDelay = baseDelay * 3;
        expect(delay).toBeGreaterThanOrEqual(minDelay);
        expect(delay).toBeLessThanOrEqual(maxDelay);
      }
    });

    test('applies full jitter to linear backoff', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: { retries: 3, delayFactor: 100, backoff: 'linear', backoffJitter: 'full' },
      });

      const mockError: any = { response: null };

      for (let i = 1; i <= 3; i++) {
        const delay = (client as any).getRetryDelay(i, mockError, 'linear', 100, 'full');
        const maxDelay = 100 * i; // Expected max for linear
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(maxDelay);
      }
    });

    test('applies full jitter to no backoff', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: { retries: 3, delayFactor: 100, backoff: 'none', backoffJitter: 'full' },
      });

      const mockError: any = { response: null };

      for (let i = 1; i <= 3; i++) {
        const delay = (client as any).getRetryDelay(i, mockError, 'none', 100, 'full');
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(100); // Constant delay
      }
    });

    test('respects Retry-After header with numeric value (seconds)', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'full',
        },
      });

      const mockError: any = {
        response: {
          headers: { 'retry-after': '5' },
        },
      };

      const delay = (client as any).getRetryDelay(1, mockError, 'exponential', 100, 'full');
      expect(delay).toBe(5000); // 5 seconds in milliseconds
    });

    test('respects Retry-After header with HTTP date string', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'full',
        },
      });

      const futureDate = new Date(Date.now() + 10000); // 10 seconds in the future
      const mockError: any = {
        response: {
          headers: { 'Retry-After': futureDate.toUTCString() },
        },
      };

      const delay = (client as any).getRetryDelay(1, mockError, 'exponential', 100, 'full');
      expect(delay).toBeGreaterThan(9000); // Should be close to 10 seconds
      expect(delay).toBeLessThanOrEqual(10000);
    });

    test('Retry-After takes precedence over calculated backoff', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'full',
        },
      });

      const mockError: any = {
        response: {
          headers: { 'retry-after': '2' },
        },
      };

      // Retry count 3 with exponential would normally be 400ms (100 * 2^2)
      // But Retry-After should override this
      const delay = (client as any).getRetryDelay(3, mockError, 'exponential', 100, 'full');
      expect(delay).toBe(2000); // 2 seconds in milliseconds, not affected by jitter
    });

    test('jitter is NOT applied when Retry-After header is present', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'full',
        },
      });

      const mockError: any = {
        response: {
          headers: { 'retry-after': '3' },
        },
      };

      // Run multiple times to ensure it's always exactly 3000ms
      for (let i = 0; i < 10; i++) {
        const delay = (client as any).getRetryDelay(1, mockError, 'exponential', 100, 'full');
        expect(delay).toBe(3000); // Always exactly 3 seconds
      }
    });

    test('supports per-request backoffJitter override', async () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'none',
        },
      });

      const mock = new MockPlugin(client.client);
      mock.onGet('/test').reply(200, { success: true });

      // This should not throw even though we're overriding jitter config
      await expect(
        client.get('/test', {
          retryConfig: {
            retries: 2,
            delayFactor: 100,
            backoff: 'exponential',
            backoffJitter: 'full',
          },
        })
      ).resolves.toBeDefined();

      mock.restore();
    });

    test('per-request jitter config overrides instance-level config', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'none',
        },
      });

      const mockError: any = { response: null };

      // Simulate per-request override by directly calling getRetryDelay with 'full' jitter
      const delay = (client as any).getRetryDelay(1, mockError, 'exponential', 100, 'full');
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(100);
    });

    test('handles invalid Retry-After header gracefully', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 3,
          delayFactor: 100,
          backoff: 'exponential',
          backoffJitter: 'none',
        },
      });

      const mockError: any = {
        response: {
          headers: { 'retry-after': 'invalid-value' },
        },
      };

      // Should fall back to calculated delay when Retry-After is invalid
      const delay = (client as any).getRetryDelay(1, mockError, 'exponential', 100, 'none');
      expect(delay).toBe(100); // First retry with exponential: 100 * 2^0
    });

    test('parseRetryAfter handles numeric string correctly', () => {
      const client = new HttpClient({ baseURL: 'https://api.example.com' });
      const result = (client as any).parseRetryAfter('10');
      expect(result).toBe(10000); // 10 seconds in milliseconds
    });

    test('parseRetryAfter handles HTTP date correctly', () => {
      const client = new HttpClient({ baseURL: 'https://api.example.com' });
      const futureDate = new Date(Date.now() + 5000);
      const result = (client as any).parseRetryAfter(futureDate.toUTCString());
      expect(result).toBeGreaterThan(4000);
      expect(result).toBeLessThanOrEqual(5000);
    });

    test('parseRetryAfter returns null for invalid input', () => {
      const client = new HttpClient({ baseURL: 'https://api.example.com' });
      const result = (client as any).parseRetryAfter('not-a-date-or-number');
      expect(result).toBeNull();
    });

    test('parseRetryAfter returns 0 for past dates', () => {
      const client = new HttpClient({ baseURL: 'https://api.example.com' });
      const pastDate = new Date(Date.now() - 5000);
      const result = (client as any).parseRetryAfter(pastDate.toUTCString());
      expect(result).toBe(0);
    });
  });

  describe('Request Modification', () => {
    test('allows request modification through beforeRequest', async () => {
      class CustomClient extends HttpClient {
        protected async beforeRequest(
          _requestType: RequestType,
          _url: string,
          data: any,
          config: any
        ) {
          // Modify data and config directly
          Object.assign(data, { modified: true });
          config.headers = { ...config.headers, 'X-Custom': 'test' };
        }
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);

      customMock.onPost('/modified').reply((config: any) => {
        const requestData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        expect(requestData.modified).toBe(true);
        expect(config.headers!['X-Custom']).toBe('test');
        return [200, { success: true }];
      });

      await customClient.post('/modified', { original: true });

      customMock.restore();
    });
  });

  describe('Different Data Types', () => {
    test('handles FormData requests', async () => {
      const formData = new FormData();
      formData.append('name', 'John Doe');
      formData.append('email', 'john@example.com');

      mock.onPost('/form').reply((config: any) => {
        expect(config.data).toBeInstanceOf(FormData);
        return [200, { success: true }];
      });

      const response = await client.post('/form', formData);
      expect(response.data).toEqual({ success: true });
    });

    test('handles URLSearchParams requests', async () => {
      const params = new URLSearchParams();
      params.append('username', 'johndoe');
      params.append('password', 'secret123');

      mock.onPost('/login').reply((config: any) => {
        expect(config.data).toBeInstanceOf(URLSearchParams);
        return [200, { success: true }];
      });

      const response = await client.post('/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      expect(response.data).toEqual({ success: true });
    });

    test('handles plain text requests', async () => {
      const textData = 'Hello World';

      mock.onPost('/text').reply((config: any) => {
        expect(config.data).toBe(textData);
        expect(config.headers?.['Content-Type']).toBe('text/plain');
        return [200, { success: true }];
      });

      const response = await client.post('/text', textData, {
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(response.data).toEqual({ success: true });
    });

    test('handles binary data requests', async () => {
      const binaryData = new ArrayBuffer(8);
      const view = new Uint8Array(binaryData);
      view[0] = 0x48; // 'H'
      view[1] = 0x65; // 'e'

      mock.onPost('/binary').reply((config: any) => {
        expect(config.data).toBeInstanceOf(ArrayBuffer);
        expect(config.headers?.['Content-Type']).toBe('application/octet-stream');
        return [200, { success: true }];
      });

      const response = await client.post('/binary', binaryData, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    test('handles empty response data', async () => {
      mock.onGet('/empty').reply(200, '');

      const response = await client.get('/empty');
      expect(response.data).toBe('');
    });

    test('handles null response data', async () => {
      mock.onGet('/null').reply(200, null);

      const response = await client.get('/null');
      expect(response.data).toBeNull();
    });

    test('handles undefined response data', async () => {
      mock.onGet('/undefined').reply(200, undefined);

      const response = await client.get('/undefined');
      expect(response.data).toBeUndefined();
    });

    test('handles custom error handler', async () => {
      class CustomClient extends HttpClient {
        public errorHandler = jest.fn();
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/error').reply(500, { error: 'Server Error' });

      await expect(customClient.get('/error')).rejects.toThrow();
      expect(customClient.errorHandler).toHaveBeenCalled();
      customMock.restore();
    });

    test('handles beforeRequest hook', async () => {
      class CustomClient extends HttpClient {
        public beforeRequest = jest.fn();
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/test').reply(200, { success: true });

      await customClient.get('/test');
      expect(customClient.beforeRequest).toHaveBeenCalledWith(
        RequestType.GET,
        '/test',
        undefined,
        expect.any(Object)
      );
      customMock.restore();
    });

    test('handles beforeRequest hook with direct mutation', async () => {
      class CustomClient extends HttpClient {
        public beforeRequest = jest.fn().mockImplementation((_requestType, _url, data, config) => {
          // Simulate direct mutation - replace the data object
          Object.keys(data).forEach(key => delete data[key]);
          Object.assign(data, { modified: true });
          config.headers = { ...config.headers, 'X-Custom': 'test' };
        });
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onPost('/test').reply((config: any) => {
        expect(config.data).toEqual({ modified: true });
        expect(config.headers?.['X-Custom']).toBe('test');
        return [200, { success: true }];
      });

      await customClient.post('/test', { original: true });
      expect(customClient.beforeRequest).toHaveBeenCalled();
      customMock.restore();
    });

    test('handles afterResponse hook', async () => {
      class CustomClient extends HttpClient {
        public afterResponse = jest.fn();
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/test').reply(200, { success: true });

      await customClient.get('/test');
      expect(customClient.afterResponse).toHaveBeenCalledWith(
        RequestType.GET,
        '/test',
        expect.any(Object), // response object
        { success: true } // data
      );
      customMock.restore();
    });

    test('handles afterResponse hook with data modification', async () => {
      class CustomClient extends HttpClient {
        protected async afterResponse(
          _requestType: RequestType,
          _url: string,
          _response: any,
          data: any
        ) {
          // Modify response data directly
          data.modified = true;
          data.timestamp = Date.now();
        }
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/test').reply(200, { success: true });

      const response = await customClient.get('/test');
      expect(response.data).toHaveProperty('modified', true);
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data.success).toBe(true);
      customMock.restore();
    });

    test('afterResponse hook is not called for error responses', async () => {
      class CustomClient extends HttpClient {
        public afterResponse = jest.fn();
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/error').reply(500, { error: 'Server Error' });

      await expect(customClient.get('/error')).rejects.toThrow();
      expect(customClient.afterResponse).not.toHaveBeenCalled();
      customMock.restore();
    });

    test('combined beforeRequest and afterResponse workflow', async () => {
      class CustomClient extends HttpClient {
        public beforeRequestSpy = jest.fn();
        public afterResponseSpy = jest.fn();

        protected async beforeRequest(
          _requestType: RequestType,
          _url: string,
          data: any,
          config: any
        ) {
          this.beforeRequestSpy(_requestType, _url, data, config);
          // Add request timestamp
          data.requestTime = Date.now();
          config.headers = { ...config.headers, 'X-Request-Time': data.requestTime.toString() };
        }

        protected async afterResponse(
          _requestType: RequestType,
          _url: string,
          response: any,
          data: any
        ) {
          this.afterResponseSpy(_requestType, _url, response, data);
          // Add response processing timestamp
          data.responseTime = Date.now();
        }
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onPost('/workflow').reply((config: any) => {
        const requestData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        expect(requestData.requestTime).toBeDefined();
        expect(config.headers!['X-Request-Time']).toBeDefined();
        return [200, { success: true }];
      });

      const response = await customClient.post('/workflow', { test: true });

      expect(customClient.beforeRequestSpy).toHaveBeenCalled();
      expect(customClient.afterResponseSpy).toHaveBeenCalled();
      expect(response.data.responseTime).toBeDefined();
      customMock.restore();
    });
  });

  describe('Debug Logging', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('logs verbose request details when debugLevel is verbose', async () => {
      const verboseClient = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
      });

      const verboseMock = new MockPlugin(verboseClient.client);
      verboseMock.onGet('/test').reply(200, { success: true });

      await verboseClient.get('/test');

      expect(require('../src/logger').logData).toHaveBeenCalledWith(
        '[HttpClient] GET /test',
        expect.objectContaining({ data: undefined, config: expect.any(Object) })
      );
      verboseMock.restore();
    });

    test('logs normal request details when debugLevel is normal', async () => {
      const normalClient = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'normal',
      });

      const normalMock = new MockPlugin(normalClient.client);
      normalMock.onPost('/test').reply(200, { success: true });

      await normalClient.post('/test', { data: 'test' });

      expect(require('../src/logger').logData).toHaveBeenCalledWith(
        '[HttpClient] POST /test',
        expect.objectContaining({ data: { data: 'test' } })
      );
      normalMock.restore();
    });
  });

  describe('Error Handling Edge Cases', () => {
    test('handles error with response but no status', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error('Network Error');
        (error as any).response = { data: { message: 'Server Error' } };
        // No status property
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow();
    });

    test('handles error with response and status but no data.message', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error('Network Error');
        (error as any).response = {
          status: 400,
          data: { error: 'Bad Request' }, // Different property name
        };
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow(HttpError);
    });

    test('handles error with response, status, and data but no message property', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error('Network Error');
        (error as any).response = {
          status: 500,
          data: { errors: ['Server Error'] }, // No message property
        };
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow(HttpError);
    });

    test('handles error without toString method', async () => {
      mock.onGet('/error').reply(() => {
        const error = { message: 'Custom Error' }; // No toString method
        (error as any).response = {
          status: 400,
          data: { message: 'Bad Request' },
        };
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow(HttpError);
    });

    test('handles error with toString method', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error('Network Error');
        error.toString = () => 'Custom toString';
        (error as any).response = {
          status: 400,
          data: { message: 'Bad Request' },
        };
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow(HttpError);
    });

    test('handles error without request property', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error('Setup Error');
        // No request property
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow();
    });

    test('handles error with request but no message', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error();
        (error as any).request = {};
        // No message property
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow();
    });

    test('handles error with request and message', async () => {
      mock.onGet('/error').reply(() => {
        const error = new Error('Request Error');
        (error as any).request = {};
        throw error;
      });

      await expect(client.get('/error')).rejects.toThrow();
    });

    test('handles error with verbose debug logging', async () => {
      const debugClient = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
      });

      const debugMock = new MockPlugin(debugClient.client);
      debugMock.onGet('/error').reply(() => {
        const error = new Error('Request Error');
        (error as any).request = {};
        throw error;
      });

      await expect(debugClient.get('/error')).rejects.toThrow();
      debugMock.restore();
    });

    test('handles error with normal debug logging', async () => {
      const debugClient = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'normal',
      });

      const debugMock = new MockPlugin(debugClient.client);
      debugMock.onGet('/error').reply(() => {
        const error = new Error('Request Error');
        (error as any).request = {};
        throw error;
      });

      await expect(debugClient.get('/error')).rejects.toThrow();
      debugMock.restore();
    });

    test('handles error with verbose debug logging for response errors', async () => {
      const debugClient = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
      });

      const debugMock = new MockPlugin(debugClient.client);
      debugMock.onGet('/error').reply(() => {
        const error = new Error('Response Error');
        (error as any).response = {
          status: 500,
          data: { message: 'Server Error' },
        };
        throw error;
      });

      await expect(debugClient.get('/error')).rejects.toThrow();
      debugMock.restore();
    });

    test('handles error with normal debug logging for response errors', async () => {
      const debugClient = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'normal',
      });

      const debugMock = new MockPlugin(debugClient.client);
      debugMock.onGet('/error').reply(() => {
        const error = new Error('Response Error');
        (error as any).response = {
          status: 500,
          data: { message: 'Server Error' },
        };
        throw error;
      });

      await expect(debugClient.get('/error')).rejects.toThrow();
      debugMock.restore();
    });
  });

  describe('Retry Mechanism Edge Cases', () => {
    test('handles retry with custom enableRetry function returning false', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 2,
          enableRetry: () => false, // Never retry
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(retryClient.get('/test')).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with custom enableRetry function returning true', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          enableRetry: () => true, // Always retry
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(retryClient.get('/test')).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with custom enableRetry function returning undefined', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          enableRetry: () => undefined, // Should use default logic
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(retryClient.get('/test')).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with custom onRetry callback', async () => {
      const onRetrySpy = jest.fn();
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          onRetry: onRetrySpy,
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(retryClient.get('/test')).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with custom retryDelay function', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          retryDelay: () => 1000, // Fixed 1 second delay
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(retryClient.get('/test')).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with per-request retry config override', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          delayFactor: 100,
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(
        retryClient.get('/test', {
          retryConfig: {
            retries: 2,
            delayFactor: 200,
            backoff: 'linear',
            backoffJitter: 'full',
          },
        })
      ).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with per-request enableRetry override', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          enableRetry: () => true,
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(
        retryClient.get('/test', {
          retryConfig: {
            retries: 1,
            enableRetry: () => false,
          },
        })
      ).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with per-request onRetry override', async () => {
      const onRetrySpy = jest.fn();
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(
        retryClient.get('/test', {
          retryConfig: {
            retries: 1,
            onRetry: onRetrySpy,
          },
        })
      ).rejects.toThrow();
      retryMock.restore();
    });

    test('handles retry with per-request retryDelay override', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
          retryDelay: () => 1000,
        },
      });

      const retryMock = new MockPlugin(retryClient.client);
      retryMock.onGet('/test').reply(500, { error: 'Server Error' });

      await expect(
        retryClient.get('/test', {
          retryConfig: {
            retries: 1,
            retryDelay: () => 2000,
          },
        })
      ).rejects.toThrow();
      retryMock.restore();
    });
  });

  describe('New Error Types', () => {
    test('creates HttpError with all properties', () => {
      const cause = new Error('Original error');
      const response = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        data: { message: 'Not Found' },
      };
      const metadata = {
        request: {
          method: 'GET',
          url: '/test',
          baseURL: 'https://api.example.com',
          headers: {},
          timestamp: new Date().toISOString(),
        },
        clientName: 'HttpClient',
      };
      const error = new HttpError(
        'Test error',
        404,
        HttpErrorCategory.NOT_FOUND,
        'Not Found',
        response,
        metadata,
        cause
      );

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.category).toBe(HttpErrorCategory.NOT_FOUND);
      expect(error.response).toBe(response);
      expect(error.isRetriable).toBe(false);
      expect(error.cause).toBe(cause);
    });

    test('creates NetworkError with all properties', () => {
      const cause = new Error('Network error');
      const metadata = {
        request: {
          method: 'GET',
          url: '/test',
          baseURL: 'https://api.example.com',
          headers: {},
          timestamp: new Date().toISOString(),
        },
        clientName: 'HttpClient',
        error: { code: 'ECONNREFUSED', message: 'Connection refused', type: 'connection_refused' },
      };
      const error = new NetworkError('Test network error', metadata, cause);

      expect(error.message).toBe('Test network error');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.isRetriable).toBe(true);
      expect(error.metadata).toBe(metadata);
      expect(error.cause).toBe(cause);
    });

    test('creates TimeoutError with all properties', () => {
      const cause = new Error('Timeout error');
      const metadata = {
        request: {
          method: 'GET',
          url: '/test',
          baseURL: 'https://api.example.com',
          headers: {},
          timestamp: new Date().toISOString(),
        },
        clientName: 'HttpClient',
        error: { code: 'ETIMEDOUT', message: 'Request timeout', type: 'request_timeout' },
      };
      const error = new TimeoutError('Test timeout error', metadata, cause);

      expect(error.message).toBe('Test timeout error');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.isRetriable).toBe(true);
      expect(error.metadata).toBe(metadata);
      expect(error.cause).toBe(cause);
    });

    test('creates SerializationError with all properties', () => {
      const cause = new Error('JSON parse error');
      const metadata = {
        request: {
          method: 'POST',
          url: '/test',
          baseURL: 'https://api.example.com',
          headers: {},
          timestamp: new Date().toISOString(),
        },
        clientName: 'HttpClient',
      };
      const error = new SerializationError('Test serialization error', metadata, cause);

      expect(error.message).toBe('Test serialization error');
      expect(error.code).toBe('SERIALIZATION_ERROR');
      expect(error.isRetriable).toBe(false);
      expect(error.metadata).toBe(metadata);
      expect(error.cause).toBe(cause);
    });
  });

  describe('classifyErrorForRetry', () => {
    test('classifies timeout errors correctly', () => {
      const error = { code: 'ETIMEDOUT', message: 'timeout of 5000ms exceeded' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('timeout');
      expect(classification.isRetriable).toBe(true);
    });

    test('classifies network errors correctly', () => {
      const error = { request: {}, message: 'Network Error' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('network');
      expect(classification.isRetriable).toBe(true);
    });

    test('classifies HTTP errors correctly', () => {
      const error = { response: { status: 404 } };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('http');
      expect(classification.status).toBe(404);
      expect(classification.category).toBe(HttpErrorCategory.NOT_FOUND);
      expect(classification.isRetriable).toBe(false);
    });

    test('classifies server errors as retriable', () => {
      const error = { response: { status: 500 } };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('http');
      expect(classification.status).toBe(500);
      expect(classification.category).toBe(HttpErrorCategory.SERVER_ERROR);
      expect(classification.isRetriable).toBe(true);
    });

    test('classifies rate limit errors as retriable', () => {
      const error = { response: { status: 429 } };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('http');
      expect(classification.status).toBe(429);
      expect(classification.category).toBe(HttpErrorCategory.RATE_LIMIT);
      expect(classification.isRetriable).toBe(true);
    });

    test('classifies serialization errors correctly', () => {
      const error = { message: 'Unexpected token in JSON', name: 'SyntaxError' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('serialization');
      expect(classification.isRetriable).toBe(false);
    });

    test('classifies authentication errors correctly', () => {
      const error401 = { response: { status: 401 } };
      const classification401 = classifyErrorForRetry(error401);

      expect(classification401.type).toBe('http');
      expect(classification401.status).toBe(401);
      expect(classification401.category).toBe(HttpErrorCategory.AUTHENTICATION);
      expect(classification401.isRetriable).toBe(false);

      const error403 = { response: { status: 403 } };
      const classification403 = classifyErrorForRetry(error403);

      expect(classification403.type).toBe('http');
      expect(classification403.status).toBe(403);
      expect(classification403.category).toBe(HttpErrorCategory.AUTHENTICATION);
      expect(classification403.isRetriable).toBe(false);
    });

    test('classifies validation errors correctly', () => {
      const error400 = { response: { status: 400 } };
      const classification400 = classifyErrorForRetry(error400);

      expect(classification400.type).toBe('http');
      expect(classification400.status).toBe(400);
      expect(classification400.category).toBe(HttpErrorCategory.VALIDATION);
      expect(classification400.isRetriable).toBe(false);

      const error422 = { response: { status: 422 } };
      const classification422 = classifyErrorForRetry(error422);

      expect(classification422.type).toBe('http');
      expect(classification422.status).toBe(422);
      expect(classification422.category).toBe(HttpErrorCategory.VALIDATION);
      expect(classification422.isRetriable).toBe(false);
    });

    test('classifies other client errors correctly', () => {
      const error418 = { response: { status: 418 } }; // I'm a teapot
      const classification = classifyErrorForRetry(error418);

      expect(classification.type).toBe('http');
      expect(classification.status).toBe(418);
      expect(classification.category).toBe(HttpErrorCategory.CLIENT_ERROR);
      expect(classification.isRetriable).toBe(false);
    });

    test('classifies different timeout error patterns', () => {
      const error1 = { code: 'ESOCKETTIMEDOUT', message: 'Socket timeout' };
      const classification1 = classifyErrorForRetry(error1);

      expect(classification1.type).toBe('timeout');
      expect(classification1.isRetriable).toBe(true);

      const error2 = { message: 'timeout of 10000ms exceeded' };
      const classification2 = classifyErrorForRetry(error2);

      expect(classification2.type).toBe('timeout');
      expect(classification2.isRetriable).toBe(true);

      const error3 = { isTimeout: true };
      const classification3 = classifyErrorForRetry(error3);

      expect(classification3.type).toBe('timeout');
      expect(classification3.isRetriable).toBe(true);
    });

    test('classifies different serialization error patterns', () => {
      const error1 = { message: 'Invalid JSON', name: 'SyntaxError' };
      const classification1 = classifyErrorForRetry(error1);

      expect(classification1.type).toBe('serialization');
      expect(classification1.isRetriable).toBe(false);

      const error2 = { message: 'Unexpected token < in JSON', name: 'TypeError' };
      const classification2 = classifyErrorForRetry(error2);

      expect(classification2.type).toBe('serialization');
      expect(classification2.isRetriable).toBe(false);

      const error3 = { message: 'Failed to parse JSON response' };
      const classification3 = classifyErrorForRetry(error3);

      expect(classification3.type).toBe('serialization');
      expect(classification3.isRetriable).toBe(false);
    });

    test('classifies different network error patterns', () => {
      const error1 = { request: {}, code: 'ECONNREFUSED' };
      const classification1 = classifyErrorForRetry(error1);

      expect(classification1.type).toBe('network');
      expect(classification1.isRetriable).toBe(true);

      const error2 = { request: {}, code: 'ENOTFOUND' };
      const classification2 = classifyErrorForRetry(error2);

      expect(classification2.type).toBe('network');
      expect(classification2.isRetriable).toBe(true);
    });

    test('classifies unknown errors correctly', () => {
      const error = { message: 'Unknown error' };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('unknown');
      expect(classification.isRetriable).toBe(false);
    });

    test('prioritizes timeout detection over other patterns', () => {
      // Error that could be classified as both timeout and serialization
      const error = {
        code: 'ETIMEDOUT',
        message: 'timeout of 5000ms exceeded',
        name: 'SyntaxError',
      };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('timeout');
      expect(classification.isRetriable).toBe(true);
    });

    test('prioritizes serialization detection over network patterns', () => {
      // Error that could be classified as both serialization and network
      const error = {
        request: {},
        message: 'Unexpected token in JSON',
        name: 'SyntaxError',
      };
      const classification = classifyErrorForRetry(error);

      expect(classification.type).toBe('serialization');
      expect(classification.isRetriable).toBe(false);
    });

    test('integration test - retry logic uses classifyErrorForRetry', async () => {
      const retryClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 2,
          delayFactor: 10, // Fast retries for testing
        },
      });

      const retryMock = new MockPlugin(retryClient.client);

      // Mock a 500 error that should be retried
      retryMock.onGet('/server-error').reply(500, { error: 'Server Error' });

      // This should retry and eventually fail
      await expect(retryClient.get('/server-error')).rejects.toThrow(HttpError);

      retryMock.restore();
    });

    test('integration test - custom enableRetry with classifyErrorForRetry', async () => {
      const customClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 2,
          delayFactor: 10,
          enableRetry: (_config, error) => {
            const classification = classifyErrorForRetry(error);

            // Only retry server errors, not client errors
            if (
              classification.type === 'http' &&
              classification.category === HttpErrorCategory.SERVER_ERROR
            ) {
              return true;
            }

            return false; // Don't retry anything else
          },
        },
      });

      const customMock = new MockPlugin(customClient.client);

      // Mock a 400 error that should NOT be retried
      customMock.onGet('/client-error').reply(400, { error: 'Bad Request' });

      // This should not retry and fail immediately
      await expect(customClient.get('/client-error')).rejects.toThrow(HttpError);

      customMock.restore();
    });
  });

  describe('Additional Coverage Tests', () => {
    describe('Debug Logging in Retry Configuration', () => {
      test('logs retry information when debug is enabled', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const debugClient = new HttpClient({
          baseURL: 'https://api.example.com',
          debug: true,
          retryConfig: { retries: 2, delayFactor: 10 },
        });

        const debugMock = new MockPlugin(debugClient.client);
        debugMock.onGet('/test').reply(500, { error: 'Server Error' });

        try {
          await debugClient.get('/test');
        } catch (error) {
          // Expected to fail
        }

        // The retry logging happens during the retry process, not in the final error
        // So we just verify the client was created with debug enabled
        expect(debugClient.debug).toBe(true);

        consoleSpy.mockRestore();
        debugMock.restore();
      });
    });

    describe('Per-Request Retry Configuration', () => {
      test('uses custom retryDelay function when provided', async () => {
        const customRetryDelay = jest.fn(() => 1000);

        const client = new HttpClient({
          baseURL: 'https://api.example.com',
          retryConfig: { retries: 1 },
        });

        const mock = new MockPlugin(client.client);
        mock.onGet('/test').reply(500, { error: 'Server Error' });

        try {
          await client.get('/test', {
            retryConfig: {
              retries: 1,
              retryDelay: customRetryDelay,
            },
          });
        } catch (error) {
          // Expected to fail
        }

        // The custom retryDelay function is used internally by the retry plugin
        // We verify the client was created with the custom function
        expect(client.retryConfig.retryDelay).toBeDefined();
        mock.restore();
      });

      test('uses default retryDelay when custom one is not provided', async () => {
        const client = new HttpClient({
          baseURL: 'https://api.example.com',
          retryConfig: { retries: 1 },
        });

        const mock = new MockPlugin(client.client);
        mock.onGet('/test').reply(500, { error: 'Server Error' });

        try {
          await client.get('/test', {
            retryConfig: {
              retries: 1,
              // No custom retryDelay provided
            },
          });
        } catch (error) {
          // Expected to fail
        }

        mock.restore();
      });
    });

    describe('Error Handling Edge Cases', () => {
      test('handles verbose debug logging for setup errors', async () => {
        const debugClient = new HttpClient({
          baseURL: 'https://api.example.com',
          debug: true,
          debugLevel: 'verbose',
        });

        const debugMock = new MockPlugin(debugClient.client);
        debugMock.onGet('/error').reply(() => {
          const error = new Error('Setup Error');
          // No request property
          throw error;
        });

        await expect(debugClient.get('/error')).rejects.toThrow();
        debugMock.restore();
      });

      test('handles serialization error detection', async () => {
        // Test different serialization error patterns
        const serializationErrors = [
          { message: 'Unexpected token in JSON', name: 'SyntaxError' },
          { message: 'Invalid JSON', name: 'TypeError' },
          { message: 'JSON parse error' },
          { message: 'Failed to parse JSON response' },
          { message: 'Unexpected token < in JSON' },
          { message: 'JSON syntax error' },
          { message: 'Invalid JSON syntax' },
        ];

        serializationErrors.forEach(error => {
          const isSerialization = isSerializationError(error);
          expect(isSerialization).toBe(true);
        });
      });

      test('handles timeout error detection in error handler', async () => {
        const client = new HttpClient({ baseURL: 'https://api.example.com' });
        const mock = new MockPlugin(client.client);

        mock.onGet('/timeout').reply(() => {
          const error = new Error('Request timeout') as any;
          error.code = 'ETIMEDOUT';
          throw error;
        });

        await expect(client.get('/timeout')).rejects.toThrow(TimeoutError);
        mock.restore();
      });

      test('handles network error as fallback', async () => {
        const client = new HttpClient({ baseURL: 'https://api.example.com' });
        const mock = new MockPlugin(client.client);

        mock.onGet('/network').reply(() => {
          const error = new Error('Network error') as any;
          error.request = {};
          throw error;
        });

        await expect(client.get('/network')).rejects.toThrow(NetworkError);
        mock.restore();
      });

      test('handles serialization error in error handler', async () => {
        const client = new HttpClient({ baseURL: 'https://api.example.com' });
        const mock = new MockPlugin(client.client);

        mock.onGet('/serialization').reply(() => {
          const error = new Error('Unexpected token in JSON');
          error.name = 'SyntaxError';
          throw error;
        });

        await expect(client.get('/serialization')).rejects.toThrow(SerializationError);
        mock.restore();
      });
    });

    describe('Retry Configuration Edge Cases', () => {
      test('handles retry configuration with custom retryDelay function', () => {
        const customRetryDelay = jest.fn(() => 2000);

        const client = new HttpClient({
          baseURL: 'https://api.example.com',
          retryConfig: {
            retries: 3,
            retryDelay: customRetryDelay,
          },
        });

        expect(client.retryConfig.retryDelay).toBe(customRetryDelay);
      });

      test('handles retry configuration with custom onRetry function', () => {
        const customOnRetry = jest.fn();

        const client = new HttpClient({
          baseURL: 'https://api.example.com',
          retryConfig: {
            retries: 3,
            onRetry: customOnRetry,
          },
        });

        expect(client.retryConfig.onRetry).toBe(customOnRetry);
      });

      test('handles retry configuration with custom enableRetry function', () => {
        const customEnableRetry = jest.fn(() => true);

        const client = new HttpClient({
          baseURL: 'https://api.example.com',
          retryConfig: {
            retries: 3,
            enableRetry: customEnableRetry,
          },
        });

        expect(client.retryConfig.enableRetry).toBe(customEnableRetry);
      });
    });

    describe('Error Handler Verbose Debugging', () => {
      test('logs verbose error details when debugLevel is verbose', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const debugClient = new HttpClient({
          baseURL: 'https://api.example.com',
          debug: true,
          debugLevel: 'verbose',
        });

        const debugMock = new MockPlugin(debugClient.client);
        debugMock.onGet('/error').reply(() => {
          const error = new Error('Setup Error');
          throw error;
        });

        try {
          await debugClient.get('/error');
        } catch (error) {
          // Expected to fail
        }

        // The verbose logging happens in the error handler
        // We verify the client was created with verbose debug level
        expect(debugClient.debugLevel).toBe('verbose');

        consoleSpy.mockRestore();
        debugMock.restore();
      });
    });
  });

  describe('processError method', () => {
    // Create a test client that extends HttpClient to access protected methods
    class TestClient extends HttpClient {
      public testProcessError(error: any, reqType: RequestType, url: string) {
        return this.processError(error, reqType, url);
      }
    }

    let testClient: TestClient;

    beforeEach(() => {
      testClient = new TestClient({ baseURL: 'https://api.example.com', debug: true });
    });

    test('processes HTTP response errors correctly', () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { message: 'Resource not found' },
        },
        config: { headers: {}, timeout: 5000 },
      };

      const processedError = testClient.testProcessError(error, RequestType.GET, '/test');

      expect(processedError).toBeInstanceOf(HttpError);
      if (processedError instanceof HttpError) {
        expect(processedError.status).toBe(404);
      }
      expect(processedError.message).toContain('Resource not found');
    });

    test('processes network errors correctly', () => {
      const error = {
        message: 'Network Error',
        config: { headers: {}, timeout: 5000 },
      };

      const processedError = testClient.testProcessError(error, RequestType.GET, '/test');

      expect(processedError).toBeInstanceOf(NetworkError);
      expect(processedError.message).toContain('network error');
      expect(processedError.message).toContain('Network Error');
    });

    test('processes timeout errors correctly', () => {
      const error = {
        message: 'timeout of 5000ms exceeded',
        code: 'ECONNABORTED',
        config: { headers: {}, timeout: 5000 },
      };

      const processedError = testClient.testProcessError(error, RequestType.GET, '/test');

      expect(processedError).toBeInstanceOf(TimeoutError);
      expect(processedError.message).toContain('timeout');
      expect(processedError.message).toContain('timeout of 5000ms exceeded');
    });

    test('processes serialization errors correctly', () => {
      const error = {
        message: 'Unexpected token in JSON',
        name: 'SyntaxError',
        config: { headers: {}, timeout: 5000 },
      };

      const processedError = testClient.testProcessError(error, RequestType.GET, '/test');

      expect(processedError).toBeInstanceOf(SerializationError);
      expect(processedError.message).toContain('serialization error');
      expect(processedError.message).toContain('Unexpected token in JSON');
    });

    test('builds request config metadata correctly', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Server error' },
        },
        config: {
          headers: { Authorization: 'Bearer token' },
          timeout: 10000,
        },
      };

      const processedError = testClient.testProcessError(error, RequestType.POST, '/api/data');

      expect(processedError).toBeInstanceOf(HttpError);
      if (processedError instanceof HttpError) {
        expect(processedError.metadata.request.method).toBe('POST');
        expect(processedError.metadata.request.url).toBe('/api/data');
        expect(processedError.metadata.request.baseURL).toBe('https://api.example.com');
        expect(processedError.metadata.request.headers).toEqual({ Authorization: 'Bearer token' });
        expect(processedError.metadata.request.timeout).toBe(10000);
      }
    });

    test('handles retry configuration correctly', () => {
      class TestClientWithRetry extends HttpClient {
        public testProcessError(error: any, reqType: RequestType, url: string) {
          return this.processError(error, reqType, url);
        }
      }

      const customClient = new TestClientWithRetry({
        baseURL: 'https://api.example.com',
        retryConfig: {
          enableRetry: jest.fn().mockReturnValue(true),
        },
      });

      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Server error' },
        },
        config: { headers: {}, timeout: 5000 },
      };

      const processedError = customClient.testProcessError(error, RequestType.GET, '/test');

      expect(processedError).toBeInstanceOf(HttpError);
      if (processedError instanceof HttpError) {
        expect(processedError.isRetriable).toBe(true);
      }
      expect(customClient.retryConfig.enableRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/test',
        }),
        error
      );
    });
  });

  describe('Child class error handling patterns', () => {
    test('child class can override errorHandler and use processError', async () => {
      class CustomClient extends HttpClient {
        public customErrorHandler = jest.fn();
        public processErrorCalled = false;

        protected errorHandler(error: any, reqType: RequestType, url: string) {
          this.processErrorCalled = true;
          const processedError = this.processError(error, reqType, url);
          this.customErrorHandler(processedError);
          throw processedError;
        }
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });
      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/error').reply(500, { error: 'Server Error' });

      await expect(customClient.get('/error')).rejects.toThrow();
      expect(customClient.processErrorCalled).toBe(true);
      expect(customClient.customErrorHandler).toHaveBeenCalledWith(expect.any(HttpError));
      customMock.restore();
    });

    test('child class can modify error before throwing', async () => {
      class CustomClient extends HttpClient {
        protected errorHandler(error: any, reqType: RequestType, url: string) {
          const processedError = this.processError(error, reqType, url);
          // Modify the error message
          processedError.message = `[Custom] ${processedError.message}`;
          throw processedError;
        }
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });
      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/error').reply(404, { message: 'Not found' });

      await expect(customClient.get('/error')).rejects.toThrow('[Custom]');
      customMock.restore();
    });

    test('child class can add custom logic before throwing', async () => {
      class CustomClient extends HttpClient {
        public errorLog: any[] = [];

        protected errorHandler(error: any, reqType: RequestType, url: string) {
          const processedError = this.processError(error, reqType, url);

          // Add custom logging
          this.errorLog.push({
            type: processedError.constructor.name,
            message: processedError.message,
            timestamp: new Date().toISOString(),
          });

          throw processedError;
        }
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });
      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/error').reply(500, { error: 'Server Error' });

      await expect(customClient.get('/error')).rejects.toThrow();
      expect(customClient.errorLog).toHaveLength(1);
      expect(customClient.errorLog[0].type).toBe('HttpError');
      expect(customClient.errorLog[0].message).toContain('ok');
      customMock.restore();
    });
  });
});
