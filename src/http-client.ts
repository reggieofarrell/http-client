import xior from 'xior';
import type { XiorError, XiorInstance, XiorRequestConfig, XiorResponse } from 'xior';
import errorRetryPlugin from 'xior/plugins/error-retry';
import { logData } from './logger.js';
import {
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError,
  classifyHttpError,
  isTimeoutError,
  isSerializationError,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
} from './errors.js';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

type BackoffOptions = 'exponential' | 'linear' | 'none';
type JitterOptions = 'none' | 'full' | 'equal' | 'decorrelated';

/**
 * Type for error message extraction from HTTP error responses
 * - String: dot notation path like "data.error.message"
 * - Function: custom extraction logic (errorResponse) => string | undefined
 */
type ErrorMessageExtractor = string | ((errorResponse: any) => string | undefined);

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
  /**
   * Per-request error message path override
   * String path: dot notation like "data.error.message"
   * Function: (errorResponse) => errorResponse.data?.error
   */
  errorMessagePath?: ErrorMessageExtractor;
  /**
   * Path parameters to substitute in the URL
   * URLs can contain path parameters in the format `:paramName`
   * Example: `/users/:userId/posts/:postId` with `pathParams: { userId: '123', postId: '456' }`
   * Results in: `/users/123/posts/456`
   * Values are automatically URL-encoded for safety
   */
  pathParams?: Record<string, string | number>;
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
  /**
   * Path or function to extract error message from response.
   * String path: dot notation like "data.error.message"
   * Function: (errorResponse) => errorResponse.data?.error
   * @default "data.message"
   */
  errorMessagePath?: ErrorMessageExtractor;
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
  errorMessagePath: ErrorMessageExtractor;
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
    this.errorMessagePath = config.errorMessagePath || 'data.message';
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

  /**
   * Extracts error message from response data using configured path or function
   * @param errorResponse - The error response object
   * @param extractor - String path or function to extract message
   * @returns Extracted message or undefined
   */
  private extractErrorMessage(
    errorResponse: any,
    extractor: ErrorMessageExtractor
  ): string | undefined {
    if (typeof extractor === 'function') {
      // Function-based extraction
      return extractor(errorResponse);
    }

    // String path extraction (dot notation)
    const parts = extractor.split('.');
    let current = errorResponse;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return typeof current === 'string' ? current : undefined;
  }

  /**
   * Substitutes path parameters in a URL with values from the pathParams object
   * Path parameters are defined using the :paramName format in the URL
   * All substituted values are URL-encoded for safety
   * @param url - The URL containing path parameters in :paramName format
   * @param pathParams - Object containing parameter names and their values
   * @returns The URL with path parameters substituted and URL-encoded
   * @throws Error if a required path parameter is missing from pathParams
   */
  private substitutePathParams(url: string, pathParams?: Record<string, string | number>): string {
    // If no pathParams provided, return URL as-is
    if (!pathParams || Object.keys(pathParams).length === 0) {
      // Check if URL contains any :paramName patterns - if so, throw error
      const paramPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
      const matches = url.match(paramPattern);
      if (matches && matches.length > 0) {
        const missingParams = matches.map(match => match.substring(1)); // Remove the :
        throw new Error(
          `Missing required path parameters: ${missingParams.join(', ')}. Provide values via pathParams config.`
        );
      }
      return url;
    }

    // Find all path parameter patterns in the URL (:paramName)
    // Pattern matches : followed by a valid identifier (starts with letter/underscore, then alphanumeric/underscore)
    const paramPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let substitutedUrl = url;
    const usedParams = new Set<string>();

    // Replace each parameter with its value from pathParams
    substitutedUrl = substitutedUrl.replace(paramPattern, (_match, paramName) => {
      // Check if this parameter exists in pathParams
      if (!(paramName in pathParams)) {
        throw new Error(
          `Missing required path parameter: ${paramName}. Provide value via pathParams.${paramName}`
        );
      }

      // Mark this parameter as used
      usedParams.add(paramName);

      // Get the value and convert to string if it's a number
      const value = pathParams[paramName];
      const stringValue = typeof value === 'number' ? value.toString() : value;

      // URL-encode the value using encodeURIComponent (encodes everything except: A-Z a-z 0-9 - _ . ! ~ * ' ( ))
      // This ensures special characters are properly encoded for URL paths
      return encodeURIComponent(stringValue);
    });

    // Check for unused pathParams (optional - could be useful for debugging)
    // Note: We don't throw an error for unused params as they might be intended for query params or other use

    return substitutedUrl;
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

  /**
   * Performs an HTTP request with the specified method, URL, data, and configuration
   * @param requestType - The HTTP method to use (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
   * @param url - The URL to send the request to. Can contain path parameters in the format `:paramName`
   * @param data - Optional data to send in the request body (for POST, PUT, PATCH)
   * @param config - Optional request configuration. Use `pathParams` to substitute path parameters in the URL
   * @returns Promise resolving to HttpClientResponse
   */
  async request<T>(
    requestType: RequestType,
    url: string,
    data?: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    let req: XiorResponse<T> | undefined;

    // Handle path parameter substitution early, before any other processing
    // This ensures the substituted URL is used throughout the request lifecycle
    // Extract pathParams from config before processing (we'll delete it later)
    const pathParams = config.pathParams;
    if (pathParams !== undefined) {
      // Substitute path parameters in the URL
      url = this.substitutePathParams(url, pathParams);
      // Remove pathParams from config as it's not part of XiorRequestConfig
      delete config.pathParams;
    } else {
      // Even if pathParams is not provided, check if URL has parameters and throw error
      url = this.substitutePathParams(url, undefined);
    }

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
        case RequestType.HEAD:
          req = await this.client.head<T>(url, config);
          break;
        case RequestType.OPTIONS:
          req = await this.client.options<T>(url, config);
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

  /**
   * Performs a GET request to the specified URL
   * @param url - The URL to send the GET request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async get<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.GET, url, undefined, config);
  }

  /**
   * Performs a POST request to the specified URL
   * @param url - The URL to send the POST request to
   * @param data - The data to send in the request body
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async post<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.POST, url, data, config);
  }

  /**
   * Performs a PUT request to the specified URL
   * @param url - The URL to send the PUT request to
   * @param data - The data to send in the request body
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async put<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.PUT, url, data, config);
  }

  /**
   * Performs a PATCH request to the specified URL
   * @param url - The URL to send the PATCH request to
   * @param data - The data to send in the request body
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async patch<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.PATCH, url, data, config);
  }

  /**
   * Performs a DELETE request to the specified URL
   * @param url - The URL to send the DELETE request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async delete<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.DELETE, url, undefined, config);
  }

  /**
   * Performs a HEAD request to the specified URL
   * @param url - The URL to send the HEAD request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async head<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.HEAD, url, undefined, config);
  }

  /**
   * Performs an OPTIONS request to the specified URL
   * @param url - The URL to send the OPTIONS request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async options<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.OPTIONS, url, undefined, config);
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

      // Use per-request errorMessagePath if provided, otherwise use instance default
      const extractor = error.config?.errorMessagePath || this.errorMessagePath;
      const extractedMessage = this.extractErrorMessage(error.response, extractor);
      const message = extractedMessage || statusText;

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

      if (isSerializationError(error)) {
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
}
