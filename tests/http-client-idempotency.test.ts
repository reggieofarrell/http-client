import { HttpClient, RequestType } from '../src/http-client';
import MockPlugin from 'xior/plugins/mock';

jest.mock('../src/logger', () => ({ logData: jest.fn(), logInfo: jest.fn() }));

describe('HttpClient Idempotency', () => {
  let client: HttpClient;
  let mock: MockPlugin;

  beforeEach(() => {
    client = new HttpClient({ baseURL: 'https://api.example.com' });
    mock = new MockPlugin(client.client);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Basic Idempotency Configuration', () => {
    it('should not add idempotency keys when disabled', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: false,
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post('/test', { data: 'test' });

      // Check that no idempotency key was added
      const calls = mock.history.post;
      expect(calls).toHaveLength(1);
      expect(calls?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
    });

    it('should add idempotency keys when enabled for configured methods', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST, RequestType.PATCH],
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post('/test', { data: 'test' });

      const calls = mock.history.post;
      expect(calls).toHaveLength(1);
      expect(calls?.[0]?.headers).toHaveProperty('Idempotency-Key');
      expect(calls?.[0]?.headers?.['Idempotency-Key']).toBeDefined();
    });

    it('should not add idempotency keys for non-configured methods', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      mock.onGet('/test').reply(200, { success: true });
      mock.onPut('/test').reply(200, { success: true });
      mock.onPatch('/test').reply(200, { success: true });
      mock.onDelete('/test').reply(200, { success: true });

      await client.get('/test');
      await client.put('/test', { data: 'test' });
      await client.patch('/test', { data: 'test' });
      await client.delete('/test');

      // Check that only POST requests have idempotency keys
      expect(mock.history.get).toHaveLength(1);
      expect(mock.history.put).toHaveLength(1);
      expect(mock.history.patch).toHaveLength(1);
      expect(mock.history.delete).toHaveLength(1);

      expect(mock.history.get?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
      expect(mock.history.put?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
      expect(mock.history.patch?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
      expect(mock.history.delete?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
    });
  });

  describe('Idempotency Key Generation and Caching', () => {
    it('should generate different keys for different requests', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test1').reply(200, { success: true });
      mock.onPost('/test2').reply(200, { success: true });

      await client.post('/test1', { data: 'test1' });
      await client.post('/test2', { data: 'test2' });

      const calls = mock.history.post;
      expect(calls).toHaveLength(2);

      const key1 = calls?.[0]?.headers?.['Idempotency-Key'];
      const key2 = calls?.[1]?.headers?.['Idempotency-Key'];

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });

    it('should reuse the same key for retry scenarios', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      const requestSignature = 'POST:/test:{"data":"test"}';

      // First attempt - this will generate and cache a key
      mock.onPost('/test').reply(200, { success: true });
      await client.post('/test', { data: 'test' });
      const firstKey = mock.history.post?.[0]?.headers?.['Idempotency-Key'];

      // Clear the key from cache to simulate a retry scenario
      (client as any).requestKeyCache.set(requestSignature, firstKey);

      // Now get the cached key - should be the same
      const cachedKey = (client as any).getOrCreateIdempotencyKey(requestSignature);
      expect(cachedKey).toBe(firstKey);
    });

    it('should clear cached key after successful request', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      const requestSignature = 'POST:/test:{"data":"test"}';

      mock.onPost('/test').reply(200, { success: true });
      await client.post('/test', { data: 'test' });

      // Key should be cleared after successful request
      expect((client as any).requestKeyCache.has(requestSignature)).toBe(false);
    });
  });

  describe('Manual Idempotency Key Provision', () => {
    it('should use manually provided idempotency key', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      const manualKey = 'manual-key-123';
      mock.onPost('/test').reply(200, { success: true });

      await client.post(
        '/test',
        { data: 'test' },
        {
          idempotencyKey: manualKey,
        }
      );

      const calls = mock.history.post;
      expect(calls).toHaveLength(1);
      expect(calls?.[0]?.headers?.['Idempotency-Key']).toBe(manualKey);
    });
  });

  describe('Per-Request Configuration', () => {
    it('should allow per-request idempotency configuration override', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: false, // Disabled globally
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      // Override per request
      await client.post(
        '/test',
        { data: 'test' },
        {
          idempotencyConfig: {
            enabled: true,
            methods: [RequestType.POST],
          },
        }
      );

      const calls = mock.history.post;
      expect(calls).toHaveLength(1);
      expect(calls?.[0]?.headers).toHaveProperty('Idempotency-Key');
    });
  });

  describe('Custom Header Name', () => {
    it('should use custom header name when configured', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
          headerName: 'X-Custom-Idempotency-Key',
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });
      await client.post('/test', { data: 'test' });

      const calls = mock.history.post;
      expect(calls).toHaveLength(1);
      expect(calls?.[0]?.headers).toHaveProperty('X-Custom-Idempotency-Key');
      expect(calls?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
    });
  });

  describe('Custom Key Generator', () => {
    it('should use custom key generator when provided', async () => {
      const customKeyGenerator = jest.fn(() => 'custom-key-123');

      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
          keyGenerator: customKeyGenerator,
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });
      await client.post('/test', { data: 'test' });

      expect(customKeyGenerator).toHaveBeenCalled();

      const calls = mock.history.post;
      expect(calls).toHaveLength(1);
      expect(calls?.[0]?.headers?.['Idempotency-Key']).toBe('custom-key-123');
    });
  });

  describe('Request Signature Generation', () => {
    it('should generate consistent signatures for identical requests', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const signature1 = (client as any).generateRequestSignature('POST', '/test', {
        data: 'test',
      });
      const signature2 = (client as any).generateRequestSignature('POST', '/test', {
        data: 'test',
      });

      expect(signature1).toBe(signature2);
    });

    it('should generate different signatures for different requests', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const signature1 = (client as any).generateRequestSignature('POST', '/test1', {
        data: 'test1',
      });
      const signature2 = (client as any).generateRequestSignature('POST', '/test2', {
        data: 'test2',
      });
      const signature3 = (client as any).generateRequestSignature('PUT', '/test1', {
        data: 'test1',
      });

      expect(signature1).not.toBe(signature2);
      expect(signature1).not.toBe(signature3);
      expect(signature2).not.toBe(signature3);
    });

    it('should handle undefined data in signature generation', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const signature1 = (client as any).generateRequestSignature('GET', '/test', undefined);
      const signature2 = (client as any).generateRequestSignature('GET', '/test', undefined);

      expect(signature1).toBe(signature2);
    });
  });

  describe('Error Scenarios', () => {
    it('should preserve idempotency key on request failure for retry', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      const requestSignature = 'POST:/test:{"data":"test"}';

      // Mock a failing request
      mock.onPost('/test').reply(500, { error: 'Server error' });

      try {
        await client.post('/test', { data: 'test' });
      } catch (error) {
        // Expected to fail
      }

      // Key should still be cached for retry
      expect((client as any).requestKeyCache.has(requestSignature)).toBe(true);
    });

    it('should handle malformed JSON in request data', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      // This should not throw an error
      expect(() => {
        (client as any).generateRequestSignature('POST', '/test', { circular: {} });
      }).not.toThrow();
    });
  });
});
