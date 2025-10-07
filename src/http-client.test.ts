import { HttpClient, RequestType, ApiResponseError } from './http-client';
import MockPlugin from 'xior/plugins/mock';

jest.mock('./logger', () => ({
  logData: jest.fn(),
  logInfo: jest.fn(),
}));

describe('HttpClient', () => {
  let client: HttpClient;
  let mock: MockPlugin;

  beforeEach(() => {
    client = new HttpClient({
      baseURL: 'https://api.example.com',
      debug: true,
    });
    mock = new MockPlugin(client.client);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Constructor Options', () => {
    test('uses default options when not provided', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      expect(client.debug).toBe(false);
      expect(client.debugLevel).toBe('normal');
      expect(client.name).toBe('HttpClient');
      expect(client.retryConfig).toEqual({
        retries: 0,
        retryDelay: expect.any(Function),
        onRetry: expect.any(Function),
        delayFactor: 500,
        backoff: 'exponential',
        enableRetry: expect.any(Function),
      });
    });

    test('overrides default options with provided values', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        debug: true,
        debugLevel: 'verbose',
        name: 'CustomClient',
        retryConfig: {
          retries: 5,
        },
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

      const response = await client.get('/test', {
        params: { foo: 'bar' },
      });
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

      const response = await client.get('/test', {
        headers: { 'X-Custom-Header': 'test-value' },
      });
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('Error Handling', () => {
    test('handles API error with message', async () => {
      const errorResponse = {
        message: 'Not Found',
        status: 404,
      };

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
      mock.onGet('/server-error').reply(500, {
        message: 'Internal Server Error',
      });

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
        retryConfig: {
          retries: 3,
          delayFactor: 1000,
          backoff: 'linear',
        },
      });

      expect(retryClient.retryConfig.retries).toBe(3);
      expect(retryClient.retryConfig.delayFactor).toBe(1000);
      expect(retryClient.retryConfig.backoff).toBe('linear');
    });

    test('applies per-request retry config to request options', async () => {
      const testClient = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 1,
        },
      });

      const testMock = new MockPlugin(testClient.client);
      testMock.onGet('/test').reply(200, { success: true });

      // This should not throw even though we're overriding retry config
      await expect(
        testClient.get('/test', {
          retryConfig: {
            retries: 5,
            delayFactor: 100,
          },
        })
      ).resolves.toBeDefined();

      testMock.restore();
    });

    test('uses default enableRetry function when not provided', () => {
      const client = new HttpClient({
        baseURL: 'https://api.example.com',
        retryConfig: {
          retries: 2,
        },
      });

      expect(client.retryConfig.enableRetry).toBeDefined();
      expect(typeof client.retryConfig.enableRetry).toBe('function');
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

      const customClient = new CustomClient({
        baseURL: 'https://api.example.com',
      });

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
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
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
        headers: {
          'Content-Type': 'text/plain',
        },
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
        headers: {
          'Content-Type': 'application/octet-stream',
        },
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

      const customClient = new CustomClient({
        baseURL: 'https://api.example.com',
      });

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

      const customClient = new CustomClient({
        baseURL: 'https://api.example.com',
      });

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

      const customClient = new CustomClient({
        baseURL: 'https://api.example.com',
      });

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

      expect(require('./logger').logData).toHaveBeenCalledWith(
        '[HttpClient] GET /test',
        expect.objectContaining({
          data: undefined,
          config: expect.any(Object),
        })
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

      expect(require('./logger').logData).toHaveBeenCalledWith(
        '[HttpClient] POST /test',
        expect.objectContaining({
          data: { data: 'test' },
        })
      );
      normalMock.restore();
    });
  });
});
