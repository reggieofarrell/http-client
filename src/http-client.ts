import xior from 'xior';
import type { XiorError, XiorInstance, XiorRequestConfig, XiorResponse } from 'xior';
import errorRetryPlugin from 'xior/plugins/error-retry';
import { logData } from './logger';
import {
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError,
  classifyHttpError,
  isTimeoutError,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
} from './errors';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

type BackoffOptions = 'exponential' | 'linear' | 'none';
type JitterOptions = 'none' | 'full' | 'equal' | 'decorrelated';

export interface HttpClientRetryConfig {
  /**
   * Number of times to retry failed requests
   */
  retries?: number;
  /**
   * Function to determine the delay between retries
   */
  retryDelay?: (retryCount: number, error: XiorError, config: XiorRequestConfig) => number;
  /**
   * Callback function called on each retry attempt
   */
  onRetry?: (config: XiorRequestConfig, error: XiorError, retryCount: number) => void;
  /**
   * The base delay factor in milliseconds
   */
  delayFactor?: number;
  /**
   * Backoff strategy: 'exponential', 'linear', or 'none'
   */
  backoff?: BackoffOptions;
  /**
   * Jitter strategy to prevent thundering herd: 'none', 'full', 'equal', or 'decorrelated'
   * @default 'none'
   */
  backoffJitter?: JitterOptions;
  /**
   * Function to determine if a request should be retried
   * Note: The error parameter will be a XiorError during retry evaluation,
   * but will be converted to HttpClientError types when thrown
   */
  enableRetry?: boolean | ((config: XiorRequestConfig, error: XiorError) => boolean | undefined);
}

export interface IdempotencyConfig {
  /**
   * Enable idempotency key generation
   * @default false
   */
  enabled?: boolean;
  /**
   * HTTP methods that should include idempotency keys
   * @default ['POST', 'PATCH']
   */
  methods?: RequestType[];
  /**
   * Header name for idempotency key
   * @default 'Idempotency-Key'
   */
  headerName?: string;
  /**
   * Custom function to generate idempotency keys
   * @default counter-based key generation
   */
  keyGenerator?: () => string;
}

export interface HttpClientRequestConfig extends XiorRequestConfig {
  retryConfig?: HttpClientRetryConfig;
  /**
   * Manual idempotency key for this request
   */
  idempotencyKey?: string;
  /**
   * Per-request idempotency configuration
   */
  idempotencyConfig?: IdempotencyConfig;
}

export interface HttpClientResponse<T> {
  request: XiorResponse;
  data: T;
}

export interface HttpClientOptions {
  /**
   * Configuration for the underlying xior instance
   */
  xiorConfig?: Omit<XiorRequestConfig, 'baseURL'>;
  /**
   * Base URL for the API
   */
  baseURL: string;
  /**
   * Whether to log request and response details
   */
  debug?: boolean;
  /**
   * Debug level. 'normal' will log request and response data. 'verbose' will
   * log all xior properties for the request and response
   */
  debugLevel?: 'normal' | 'verbose';
  /**
   * Name of the client. Used for logging
   */
  name?: string;
  /**
   * Configuration for the error-retry plugin.
   * The default configuration is `{ retries: 0, retryDelay: exponentialDelay, delayFactor: 500, backoff: 'exponential' }`.
   */
  retryConfig?: HttpClientRetryConfig;
  /**
   * Configuration for idempotency key generation.
   * The default configuration is `{ enabled: false, methods: ['POST', 'PATCH'], headerName: 'Idempotency-Key' }`.
   */
  idempotencyConfig?: IdempotencyConfig;
}

export class HttpClient {
  client: XiorInstance;
  xiorConfig: HttpClientOptions['xiorConfig'];
  baseURL: HttpClientOptions['baseURL'];
  debug: HttpClientOptions['debug'];
  debugLevel: HttpClientOptions['debugLevel'];
  name: HttpClientOptions['name'];
  retryConfig: HttpClientRetryConfig;
  idempotencyConfig: IdempotencyConfig;
  private requestKeyCache: Map<string, string>;
  private idempotencyCounter: number;

  constructor(config: HttpClientOptions) {
    const backoff = config.retryConfig?.backoff || 'exponential';
    const delayFactor = config.retryConfig?.delayFactor || 500;
    const name = config.name || 'HttpClient';

    const defaultRetryConfig: HttpClientRetryConfig = {
      retries: 0,
      retryDelay: (retryCount: number, error: XiorError, _requestConfig: XiorRequestConfig) =>
        this.getRetryDelay(retryCount, error, backoff, delayFactor, 'none'),
      onRetry: (requestConfig, error, retryCount) => {
        if (this.debug) {
          console.log(
            `[${name}] Retry #${retryCount} for ${requestConfig.baseURL}${requestConfig.url} due to error: ${error.message}`
          );
        }
      },
      delayFactor,
      backoff,
      backoffJitter: 'none',
      // By default, retry on 5xx errors and network errors
      enableRetry: (_config, error) => {
        // Use our error classification helper for consistent logic
        const classification = classifyErrorForRetry(error);
        return classification.isRetriable;
      },
    };

    const retryConfig: HttpClientRetryConfig = config.retryConfig
      ? {
          ...defaultRetryConfig,
          ...config.retryConfig,
        }
      : defaultRetryConfig;

    const defaultIdempotencyConfig: IdempotencyConfig = {
      enabled: false,
      methods: [RequestType.POST, RequestType.PATCH],
      headerName: 'Idempotency-Key',
    };

    const idempotencyConfig: IdempotencyConfig = config.idempotencyConfig
      ? {
          ...defaultIdempotencyConfig,
          ...config.idempotencyConfig,
        }
      : defaultIdempotencyConfig;

    delete config.retryConfig;
    delete config.idempotencyConfig;

    config = {
      xiorConfig: {},
      retryConfig,
      debug: false,
      debugLevel: 'normal',
      name,
      ...config,
    };

    this.xiorConfig = config.xiorConfig;
    this.baseURL = config.baseURL;
    this.debug = config.debug;
    this.debugLevel = config.debugLevel;
    this.name = config.name;
    this.retryConfig = config.retryConfig!;
    this.idempotencyConfig = idempotencyConfig;
    this.requestKeyCache = new Map();
    this.idempotencyCounter = 0;

    const client = xior.create({
      ...config.xiorConfig,
      baseURL: config.baseURL,
    });

    // Apply error retry plugin if retries are enabled
    if (this.retryConfig.retries && this.retryConfig.retries > 0) {
      const pluginOptions: any = {
        retryTimes: this.retryConfig.retries,
        retryInterval: (count: number, config: XiorRequestConfig, error: XiorError) => {
          return this.retryConfig.retryDelay
            ? this.retryConfig.retryDelay(count, error, config)
            : this.getRetryDelay(
                count,
                error,
                backoff,
                delayFactor,
                this.retryConfig.backoffJitter || 'none'
              );
        },
      };

      if (this.retryConfig.onRetry) {
        pluginOptions.onRetry = this.retryConfig.onRetry;
      }

      if (this.retryConfig.enableRetry !== undefined) {
        pluginOptions.enableRetry = this.retryConfig.enableRetry;
      }

      client.plugins.use(errorRetryPlugin(pluginOptions));
    }

    this.client = client;
  }

  private getRetryDelay(
    retryCount: number,
    error: XiorError,
    backoff: string,
    delayFactor: number,
    jitter: JitterOptions
  ): number {
    // Check for Retry-After header - it takes precedence over calculated delays
    if (error.response?.headers) {
      const headers = error.response.headers as any;
      const retryAfter = headers['retry-after'] || headers['Retry-After'];
      if (retryAfter) {
        const retryAfterMs = this.parseRetryAfter(retryAfter);
        if (retryAfterMs !== null) {
          // Return Retry-After value without jitter (server-specified delay)
          return retryAfterMs;
        }
      }
    }

    // Calculate base delay using backoff strategy
    let delay: number;
    if (backoff === 'exponential') {
      // Exponential backoff: delayFactor * 2^(retryCount - 1)
      delay = delayFactor * Math.pow(2, retryCount - 1);
    } else if (backoff === 'linear') {
      // Linear backoff: delayFactor * retryCount
      delay = delayFactor * retryCount;
    } else {
      // No backoff: constant delay
      delay = delayFactor;
    }

    // Apply jitter based on strategy
    if (jitter === 'full') {
      // Full jitter: random value between 0 and delay
      return Math.random() * delay;
    } else if (jitter === 'equal') {
      // Equal jitter: half deterministic, half random
      return delay / 2 + Math.random() * (delay / 2);
    } else if (jitter === 'decorrelated') {
      // Decorrelated jitter (stateless approximation): random between base and delay * 3
      return delayFactor + Math.random() * (delay * 3 - delayFactor);
    } else {
      // No jitter
      return delay;
    }
  }

  private parseRetryAfter(retryAfter: string | number): number | null {
    // If it's a number (or string number), treat as seconds
    const asNumber = Number(retryAfter);
    if (!isNaN(asNumber)) {
      return asNumber * 1000; // Convert to milliseconds
    }

    // Try parsing as HTTP date
    const asDate = new Date(retryAfter);
    if (!isNaN(asDate.getTime())) {
      const delayMs = asDate.getTime() - Date.now();
      return delayMs > 0 ? delayMs : 0;
    }

    return null;
  }

  private generateRequestSignature(method: RequestType, url: string, data?: any): string {
    // Create a unique signature for the request based on method, URL, and data
    const dataString = data ? JSON.stringify(data) : '';
    return `${method}:${url}:${dataString}`;
  }

  private generateIdempotencyKey(): string {
    // Fast counter-based key generation
    return `${Date.now()}-${(++this.idempotencyCounter).toString(36)}`;
  }

  private getOrCreateIdempotencyKey(signature: string): string {
    // Check if we already have a key for this request (retry scenario)
    if (this.requestKeyCache.has(signature)) {
      return this.requestKeyCache.get(signature)!;
    }

    // Generate new key for new request
    const key = this.generateIdempotencyKey();
    this.requestKeyCache.set(signature, key);
    return key;
  }

  private clearIdempotencyKey(signature: string): void {
    // Remove key from cache after successful request
    this.requestKeyCache.delete(signature);
  }

  private async _request<T>(
    requestType: RequestType,
    url: string,
    data?: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    let req: XiorResponse<T> | undefined;

    // Handle per-request retry config by mapping it to xior's error-retry plugin options
    if (config.retryConfig) {
      const perRequestRetryConfig = {
        ...this.retryConfig,
        ...config.retryConfig,
      };

      const backoff = perRequestRetryConfig.backoff || this.retryConfig.backoff!;
      const delayFactor = perRequestRetryConfig.delayFactor || this.retryConfig.delayFactor!;
      const backoffJitter =
        perRequestRetryConfig.backoffJitter || this.retryConfig.backoffJitter || 'none';

      // Map our config to xior's error-retry plugin options
      if (perRequestRetryConfig.retries !== undefined) {
        config.retryTimes = perRequestRetryConfig.retries;
      }

      config.retryInterval = (count: number, cfg: XiorRequestConfig, error: XiorError) => {
        return perRequestRetryConfig.retryDelay
          ? perRequestRetryConfig.retryDelay(count, error, cfg)
          : this.getRetryDelay(count, error, backoff, delayFactor, backoffJitter);
      };

      if (perRequestRetryConfig.onRetry !== undefined) {
        config.onRetry = perRequestRetryConfig.onRetry;
      }

      if (perRequestRetryConfig.enableRetry !== undefined) {
        config.enableRetry = perRequestRetryConfig.enableRetry;
      }

      delete config.retryConfig;
    }

    // Handle idempotency key generation
    const mergedIdempotencyConfig = {
      ...this.idempotencyConfig,
      ...config.idempotencyConfig,
    };

    if (mergedIdempotencyConfig.enabled && mergedIdempotencyConfig.methods?.includes(requestType)) {
      // Check if manual idempotency key is provided
      if (config.idempotencyKey) {
        config.headers = {
          ...config.headers,
          [mergedIdempotencyConfig.headerName!]: config.idempotencyKey,
        };
      } else {
        // Generate or retrieve cached idempotency key
        const requestSignature = this.generateRequestSignature(requestType, url, data);
        const idempotencyKey = mergedIdempotencyConfig.keyGenerator
          ? mergedIdempotencyConfig.keyGenerator()
          : this.getOrCreateIdempotencyKey(requestSignature);

        config.headers = {
          ...config.headers,
          [mergedIdempotencyConfig.headerName!]: idempotencyKey,
        };
      }
    }

    delete config.idempotencyKey;
    delete config.idempotencyConfig;

    // Call beforeRequest middleware hook to modify request parameters and perform actions
    await this.beforeRequest(requestType, url, data, config);

    try {
      switch (requestType) {
        case RequestType.GET:
          req = await this.client.get<T>(url, config);
          break;
        case RequestType.POST:
          req = await this.client.post<T>(url, data, config);
          break;
        case RequestType.PUT:
          req = await this.client.put<T>(url, data, config);
          break;
        case RequestType.PATCH:
          req = await this.client.patch<T>(url, data, config);
          break;
        case RequestType.DELETE:
          req = await this.client.delete<T>(url, config);
          break;
      }
    } catch (err) {
      this.errorHandler(err, requestType, url);
    }

    // Clear idempotency key after successful request
    if (mergedIdempotencyConfig.enabled && mergedIdempotencyConfig.methods?.includes(requestType)) {
      const requestSignature = this.generateRequestSignature(requestType, url, data);
      this.clearIdempotencyKey(requestSignature);
    }

    // Call afterResponse middleware hook for successful responses
    await this.afterResponse(requestType, url, req!, req!.data);

    return { request: req!, data: req!.data };
  }

  async get<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this._request<T>(RequestType.GET, url, undefined, config);
  }

  async post<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this._request<T>(RequestType.POST, url, data, config);
  }

  async put<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this._request<T>(RequestType.PUT, url, data, config);
  }

  async patch<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this._request<T>(RequestType.PATCH, url, data, config);
  }

  async delete<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this._request<T>(RequestType.DELETE, url, undefined, config);
  }

  /**
   * Override this method in your extending class to modify request parameters
   * and perform actions before the request is sent. You can modify the `data`
   * and `config` objects directly as they are passed by reference.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data (mutable)
   * @param config - The request config (mutable)
   */
  protected async beforeRequest(
    requestType: RequestType,
    url: string,
    data: any,
    config: XiorRequestConfig
  ): Promise<void> {
    // Default implementation - log request details if debug is enabled
    if (this.debug) {
      if (this.debugLevel === 'verbose') {
        logData(`[${this.name}] ${requestType} ${url}`, { data, config });
      } else {
        logData(`[${this.name}] ${requestType} ${url}`, { data });
      }
    }
  }

  /**
   * Override this method in your extending class to modify response data
   * and perform actions after receiving a successful response. You can modify
   * the `response.data` directly as it is passed by reference.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param response - The xior response object (mutable)
   * @param data - The response data (mutable reference to response.data)
   */
  protected async afterResponse(
    _requestType: RequestType,
    _url: string,
    _response: XiorResponse,
    _data: any
  ): Promise<void> {
    // Default implementation - override in extending classes
  }

  /**
   * Processes all types of errors and returns the appropriate error object
   * This method handles all the core error processing logic that should be preserved
   * @param error - The error object from xior
   * @param reqType - The request type
   * @param url - The request URL
   * @returns A fully constructed error object (HttpError, NetworkError, TimeoutError, or SerializationError)
   */
  protected processError(
    error: any,
    reqType: RequestType,
    url: string
  ): HttpError | NetworkError | TimeoutError | SerializationError {
    // Build request config for metadata (common to all error types)
    const requestConfig: XiorRequestConfig = {
      method: reqType,
      url,
      baseURL: this.baseURL,
      headers: error.config?.headers || {},
      timeout: error.config?.timeout,
    };

    if (error.response) {
      // HTTP response error (status code outside 2xx range)
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`[${this.name}] ${reqType} ${url} : error.response`, error.response);
        } else {
          logData(`[${this.name}] ${reqType} ${url} : error.response.data`, error.response.data);
        }
      }

      const metadata = buildErrorMetadata(requestConfig, this.name || 'HttpClient');
      const response = buildHttpErrorResponse(error.response);
      const category = classifyHttpError(error.response.status);
      const statusText = error.response.statusText || '';
      const message = error.response.data?.message
        ? `[${this.name}] ${reqType} ${url} : [${error.response.status}] ${error.response.data.message}`
        : `[${this.name}] ${reqType} ${url} : [${error.response.status}] ${statusText}`;

      // Check if enableRetry function overrides the default retriability
      let isRetriable: boolean | undefined;
      if (this.retryConfig.enableRetry && typeof this.retryConfig.enableRetry === 'function') {
        isRetriable = this.retryConfig.enableRetry(requestConfig, error);
      }

      return new HttpError(
        message,
        error.response.status,
        category,
        statusText,
        response,
        metadata,
        error,
        isRetriable
      );
    } else {
      // No response received or other errors (network, timeout, serialization, etc.)
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`[${this.name}] ${reqType} ${url} : error`, error);
        } else {
          console.log(`[${this.name}] ${reqType} ${url} error.message : ${error.message}`);
        }
      }

      if (this.isSerializationError(error)) {
        const metadata = buildErrorMetadata(requestConfig, this.name || 'HttpClient');
        const message = `[${this.name || 'HttpClient'}] ${reqType} ${url} [serialization error] : ${error.message || 'Serialization error'}`;
        return new SerializationError(message, metadata, error);
      }

      if (isTimeoutError(error)) {
        const metadata = buildNetworkErrorMetadata(requestConfig, this.name || 'HttpClient', error);
        const message = `[${this.name || 'HttpClient'}] ${reqType} ${url} [timeout] : ${error.message || 'Request timeout'}`;
        return new TimeoutError(message, metadata, error);
      }

      // Default to network error for other cases
      const metadata = buildNetworkErrorMetadata(requestConfig, this.name || 'HttpClient', error);
      const message = `[${this.name || 'HttpClient'}] ${reqType} ${url} [network error] : ${error.message || 'Network error'}`;
      return new NetworkError(message, metadata, error);
    }
  }

  /**
   * Handles errors from the xior instance. Override this method for
   * custom error handling functionality specific to the API you are
   * consuming.
   *
   * For custom error handling, you can:
   * 1. Call this.processError to get the processed error object, then customize and throw it
   * 2. Completely override the error handling logic
   * 3. Add custom logging, metrics, or other side effects before throwing
   *
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   * @see https://suhaotian.github.io/xior
   */
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    throw this.processError(error, reqType, url);
  }

  /**
   * Determines if an error is a serialization error
   * @param error - The error to check
   * @returns true if the error indicates serialization failure
   */
  private isSerializationError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';

    // Common serialization error patterns
    if (
      message.includes('json') ||
      message.includes('parse') ||
      message.includes('serialize') ||
      message.includes('deserialize') ||
      message.includes('invalid json') ||
      message.includes('unexpected token') ||
      message.includes('syntax error')
    ) {
      return true;
    }

    // Check for specific error types
    if (error.name === 'SyntaxError' || error.name === 'TypeError') {
      return true;
    }

    return false;
  }
}
