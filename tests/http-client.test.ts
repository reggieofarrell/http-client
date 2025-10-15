import { HttpClient, RequestType, ApiResponseError } from '../src/http-client';
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

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
      await expect(client.get('/error')).rejects.toMatchObject({
        status: 404,
        response: errorResponse,
      });
    });

    test('handles network error', async () => {
      mock.onGet('/network-error').networkError();

      await expect(client.get('/network-error')).rejects.toThrow(Error);
    });

    test('handles 500 server error', async () => {
      mock.onGet('/server-error').reply(500, { message: 'Internal Server Error' });

      await expect(client.get('/server-error')).rejects.toThrow(ApiResponseError);
    });

    test('handles timeout error', async () => {
      mock.onGet('/timeout').timeout();

      await expect(client.get('/timeout')).rejects.toThrow();
    });

    test('handles error without response data', async () => {
      mock.onGet('/error').reply(403);

      await expect(client.get('/error')).rejects.toThrow();
    });

    test('handles error with non-standard response format', async () => {
      mock.onGet('/error').reply(400, {
        errors: ['Invalid input'], // Different format than message
      });

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
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
    test('allows request modification through preRequestFilter', async () => {
      class CustomClient extends HttpClient {
        protected async preRequestFilter(
          _requestType: RequestType,
          _url: string,
          data: any,
          config: any
        ) {
          return {
            data: { ...data, modified: true },
            config: { ...config, headers: { ...config.headers, 'X-Custom': 'test' } },
          };
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

    test('handles preRequestAction hook', async () => {
      class CustomClient extends HttpClient {
        public preRequestAction = jest.fn();
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });

      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/test').reply(200, { success: true });

      await customClient.get('/test');
      expect(customClient.preRequestAction).toHaveBeenCalledWith(
        RequestType.GET,
        '/test',
        undefined,
        expect.any(Object)
      );
      customMock.restore();
    });

    test('handles preRequestFilter hook', async () => {
      class CustomClient extends HttpClient {
        public preRequestFilter = jest.fn().mockReturnValue({
          data: { modified: true },
          config: { headers: { 'X-Custom': 'test' } },
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
      expect(customClient.preRequestFilter).toHaveBeenCalled();
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

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
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

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
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

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
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

      await expect(client.get('/error')).rejects.toThrow(ApiResponseError);
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

  describe('Deprecated Methods', () => {
    test('beforeRequestFilter calls preRequestFilter', async () => {
      class CustomClient extends HttpClient {
        public preRequestFilter = jest.fn().mockReturnValue({
          data: { modified: true },
          config: { headers: { 'X-Custom': 'test' } },
        });
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });
      const customMock = new MockPlugin(customClient.client);
      customMock.onPost('/test').reply(200, { success: true });

      await customClient.post('/test', { original: true });
      expect(customClient.preRequestFilter).toHaveBeenCalled();
      customMock.restore();
    });

    test('beforeRequestAction calls preRequestAction', async () => {
      class CustomClient extends HttpClient {
        public preRequestAction = jest.fn();
      }

      const customClient = new CustomClient({ baseURL: 'https://api.example.com' });
      const customMock = new MockPlugin(customClient.client);
      customMock.onGet('/test').reply(200, { success: true });

      await customClient.get('/test');
      expect(customClient.preRequestAction).toHaveBeenCalled();
      customMock.restore();
    });
  });

  describe('ApiResponseError Class', () => {
    test('creates ApiResponseError with all properties', () => {
      const cause = new Error('Original error');
      const response = { message: 'Not Found' };
      const error = new ApiResponseError('Test error', 404, response, cause);

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.response).toBe(response);
      expect((error as any).cause).toBe(cause);
    });

    test('creates ApiResponseError without cause', () => {
      const response = { message: 'Not Found' };
      const error = new ApiResponseError('Test error', 404, response);

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.response).toBe(response);
      expect((error as any).cause).toBeUndefined();
    });

    test('creates ApiResponseError with string response', () => {
      const error = new ApiResponseError('Test error', 404, 'Not Found');

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.response).toBe('Not Found');
    });
  });
});
