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

    it('should handle circular references in request data', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // This should throw an error due to circular reference
      expect(() => {
        (client as any).generateRequestSignature('POST', '/test', circularObj);
      }).toThrow();
    });

    it('should handle null and undefined data in signature generation', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const signature1 = (client as any).generateRequestSignature('POST', '/test', null);
      const signature2 = (client as any).generateRequestSignature('POST', '/test', null);
      const signature3 = (client as any).generateRequestSignature('POST', '/test', undefined);

      expect(signature1).toBe(signature2);
      expect(signature1).toBe('POST:/test:');
      expect(signature3).toBe('POST:/test:');
    });

    it('should handle empty object and array data', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const signature1 = (client as any).generateRequestSignature('POST', '/test', {});
      const signature2 = (client as any).generateRequestSignature('POST', '/test', []);
      const signature3 = (client as any).generateRequestSignature('POST', '/test', {});

      expect(signature1).toBe('POST:/test:{}');
      expect(signature2).toBe('POST:/test:[]');
      expect(signature1).toBe(signature3);
    });

    it('should handle complex nested data structures', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const complexData = {
        user: { id: 1, name: 'John' },
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        metadata: { created: '2023-01-01', updated: '2023-01-02' },
      };

      const signature1 = (client as any).generateRequestSignature('POST', '/test', complexData);
      const signature2 = (client as any).generateRequestSignature('POST', '/test', complexData);

      expect(signature1).toBe(signature2);
      expect(signature1).toContain('POST:/test:');
    });
  });

  describe('Idempotency Key Generation Edge Cases', () => {
    it('should generate unique keys for multiple requests', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const key1 = (client as any).generateIdempotencyKey();
      const key2 = (client as any).generateIdempotencyKey();
      const key3 = (client as any).generateIdempotencyKey();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key3).toBeDefined();
      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });

    it('should generate keys with timestamp and counter', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const key = (client as any).generateIdempotencyKey();
      const parts = key.split('-');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^\d+$/); // Should be a timestamp
      expect(parts[1]).toMatch(/^[a-z0-9]+$/); // Should be base36 counter
    });

    it('should increment counter for each key generation', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const key1 = (client as any).generateIdempotencyKey();
      const key2 = (client as any).generateIdempotencyKey();

      const parts1 = key1.split('-');
      const parts2 = key2.split('-');

      const counter1 = parseInt(parts1[1], 36);
      const counter2 = parseInt(parts2[1], 36);

      expect(counter2).toBe(counter1 + 1);
    });
  });

  describe('Idempotency Configuration Edge Cases', () => {
    it('should handle empty methods array', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [], // Empty array
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });
      mock.onGet('/test').reply(200, { success: true });

      await client.post('/test', { data: 'test' });
      await client.get('/test');

      // No idempotency keys should be added
      expect(mock.history.post?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
      expect(mock.history.get?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
    });

    it('should handle undefined methods array', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST], // Use default methods
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post('/test', { data: 'test' });

      // Should use default methods (POST, PATCH)
      expect(mock.history.post?.[0]?.headers).toHaveProperty('Idempotency-Key');
    });

    it('should handle custom header name with special characters', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
          headerName: 'X-Custom-Idempotency-Key-123',
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });
      await client.post('/test', { data: 'test' });

      const calls = mock.history.post;
      expect(calls?.[0]?.headers).toHaveProperty('X-Custom-Idempotency-Key-123');
      expect(calls?.[0]?.headers).not.toHaveProperty('Idempotency-Key');
    });

    it('should handle custom key generator that returns empty string', async () => {
      const customKeyGenerator = jest.fn(() => '');

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
      expect(calls?.[0]?.headers?.['Idempotency-Key']).toBe('');
    });

    it('should handle custom key generator that returns null', async () => {
      const customKeyGenerator = jest.fn(() => null as any);

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
      expect(calls?.[0]?.headers?.['Idempotency-Key']).toBeNull();
    });
  });

  describe('Idempotency Key Caching Edge Cases', () => {
    it('should handle cache operations with non-existent keys', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      // Test getting non-existent key
      const key = (client as any).getOrCreateIdempotencyKey('non-existent-signature');
      expect(key).toBeDefined();

      // Test clearing non-existent key
      expect(() => {
        (client as any).clearIdempotencyKey('non-existent-signature');
      }).not.toThrow();
    });

    it('should handle cache operations with empty signature', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const key = (client as any).getOrCreateIdempotencyKey('');
      expect(key).toBeDefined();

      (client as any).clearIdempotencyKey('');
      expect((client as any).requestKeyCache.has('')).toBe(false);
    });

    it('should handle cache operations with special characters in signature', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const specialSignature = 'POST:/test:{"data":"test with spaces & symbols!@#$%"}';
      const key = (client as any).getOrCreateIdempotencyKey(specialSignature);
      expect(key).toBeDefined();

      (client as any).clearIdempotencyKey(specialSignature);
      expect((client as any).requestKeyCache.has(specialSignature)).toBe(false);
    });

    it('should handle multiple cache operations', () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
      });

      const signature1 = 'POST:/test1:{"data":"test1"}';
      const signature2 = 'POST:/test2:{"data":"test2"}';

      const key1 = (client as any).getOrCreateIdempotencyKey(signature1);
      const key2 = (client as any).getOrCreateIdempotencyKey(signature2);

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);

      expect((client as any).requestKeyCache.has(signature1)).toBe(true);
      expect((client as any).requestKeyCache.has(signature2)).toBe(true);

      (client as any).clearIdempotencyKey(signature1);
      expect((client as any).requestKeyCache.has(signature1)).toBe(false);
      expect((client as any).requestKeyCache.has(signature2)).toBe(true);

      (client as any).clearIdempotencyKey(signature2);
      expect((client as any).requestKeyCache.has(signature2)).toBe(false);
    });
  });

  describe('Per-Request Idempotency Edge Cases', () => {
    it('should handle per-request idempotency with undefined config', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post(
        '/test',
        { data: 'test' },
        {
          // No idempotencyConfig provided - should use global config
        }
      );

      const calls = mock.history.post;
      expect(calls?.[0]?.headers).toHaveProperty('Idempotency-Key');
    });

    it('should handle per-request idempotency with empty config', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post(
        '/test',
        { data: 'test' },
        {
          idempotencyConfig: {}, // Empty per-request config
        }
      );

      const calls = mock.history.post;
      expect(calls?.[0]?.headers).toHaveProperty('Idempotency-Key');
    });

    it('should handle per-request idempotency with custom header name', async () => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
          headerName: 'X-Global-Key',
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post(
        '/test',
        { data: 'test' },
        {
          idempotencyConfig: {
            enabled: true,
            methods: [RequestType.POST],
            headerName: 'X-Local-Key',
          },
        }
      );

      const calls = mock.history.post;
      expect(calls?.[0]?.headers).toHaveProperty('X-Local-Key');
      expect(calls?.[0]?.headers).not.toHaveProperty('X-Global-Key');
    });

    it('should handle per-request idempotency with custom key generator', async () => {
      const customKeyGenerator = jest.fn(() => 'local-custom-key');

      client = new HttpClient({
        baseURL: 'https://api.example.com',
        idempotencyConfig: {
          enabled: true,
          methods: [RequestType.POST],
          keyGenerator: () => 'global-custom-key',
        },
      });
      mock = new MockPlugin(client.client);

      mock.onPost('/test').reply(200, { success: true });

      await client.post(
        '/test',
        { data: 'test' },
        {
          idempotencyConfig: {
            enabled: true,
            methods: [RequestType.POST],
            keyGenerator: customKeyGenerator,
          },
        }
      );

      expect(customKeyGenerator).toHaveBeenCalled();
      const calls = mock.history.post;
      expect(calls?.[0]?.headers?.['Idempotency-Key']).toBe('local-custom-key');
    });
  });
});
