import xior from 'xior';
import type { XiorError, XiorInstance, XiorRequestConfig, XiorResponse } from 'xior';
import errorRetryPlugin from 'xior/plugins/error-retry';
import { logData } from './logger';

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
   */
  enableRetry?: boolean | ((config: XiorRequestConfig, error: XiorError) => boolean | undefined);
}

export interface HttpClientRequestConfig extends XiorRequestConfig {
  retryConfig?: HttpClientRetryConfig;
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
}

export class HttpClient {
  client: XiorInstance;
  xiorConfig: HttpClientOptions['xiorConfig'];
  baseURL: HttpClientOptions['baseURL'];
  debug: HttpClientOptions['debug'];
  debugLevel: HttpClientOptions['debugLevel'];
  name: HttpClientOptions['name'];
  retryConfig: HttpClientRetryConfig;

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
        if (!error.response) return true; // Network errors
        const status = error.response.status;
        return status >= 500 && status < 600; // 5xx errors
      },
    };

    const retryConfig: HttpClientRetryConfig = config.retryConfig
      ? {
          ...defaultRetryConfig,
          ...config.retryConfig,
        }
      : defaultRetryConfig;

    delete config.retryConfig;

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

    // Call beforeRequest hook to potentially modify the request parameters
    const filteredArgs = await this.preRequestFilter(requestType, url, data, config);
    data = filteredArgs.data ?? data;
    config = filteredArgs.config ?? config;

    // Call beforeRequestAction hook to perform any actions before the request is sent
    await this.preRequestAction(requestType, url, data, config);

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
   * Override this method in your extending class to modify the request data or
   * config before the request is sent.
   *
   * @deprecated Use preRequestFilter instead. This will be removed in a future version.
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   * @returns The modified request parameters
   */
  protected async beforeRequestFilter(
    requestType: RequestType,
    url: string,
    data: any,
    config: XiorRequestConfig
  ) {
    return this.preRequestFilter(requestType, url, data, config);
  }

  /**
   * Define this requestType in your extending class to globally modify the
   * request data or config before the request is sent.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   * @returns The modified request parameters
   */
  protected async preRequestFilter(
    // @ts-expect-error - not used here, but may be used in a subclass
    requestType: RequestType,
    // @ts-expect-error - not used here, but may be used in a subclass
    url: string,
    data: any,
    config: XiorRequestConfig
  ): Promise<{ data: any; config: XiorRequestConfig }> {
    return { data, config };
  }

  /**
   * Override this method in your extending class to perform any actions before
   * the request is sent such as logging the request details. By default, this will
   * log the request details if debug is enabled.
   *
   * @deprecated Use preRequestAction instead. This will be removed in a future version.
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   */
  protected async beforeRequestAction(
    requestType: RequestType,
    url: string,
    data: any,
    config: XiorRequestConfig
  ): Promise<void> {
    return this.preRequestAction(requestType, url, data, config);
  }

  /**
   * Override this method in your extending class to perform any actions before
   * the request is sent such as logging the request details. By default, this will
   * log the request details if debug is enabled.
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data
   * @param config - The request config
   */
  protected async preRequestAction(
    requestType: RequestType,
    url: string,
    data: any,
    config: XiorRequestConfig
  ): Promise<void> {
    if (this.debug) {
      if (this.debugLevel === 'verbose') {
        logData(`[${this.name}] ${requestType} ${url}`, { data, config });
      } else {
        logData(`[${this.name}] ${requestType} ${url}`, { data });
      }
    }
  }

  /**
   * Handles errors from the xior instance. Override this method for
   * custom error handling functionality specific to the API you are
   * consuming.
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   * @see https://suhaotian.github.io/xior
   */
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`[${this.name}] ${reqType} ${url} : error.response`, error.response);
        } else {
          logData(`[${this.name}] ${reqType} ${url} : error.response.data`, error.response.data);
        }
      }

      if (error.response.data && error.response.status && error.response.data?.message) {
        throw new ApiResponseError(
          `[${this.name}] ${reqType} ${url} : [${error.response.status}] ${error.response.data.message}`,
          error.response.status,
          error.response.data,
          error.toString ? error.toString() : error
        );
      } else if (
        error.response &&
        error.response.status &&
        error.response.data &&
        !error.response.data?.message
      ) {
        throw new ApiResponseError(
          `[${this.name}] ${reqType} ${url} : [${error.response.status}]`,
          error.response.status,
          error.response.data,
          error.toString ? error.toString() : error
        );
      } else {
        throw new Error(error);
      }
    } else {
      this.handleResponseNotReceivedOrOtherError(error, reqType, url);
    }
  }

  /**
   * Handles errors where a response is not received or other errors occur
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   */
  protected handleResponseNotReceivedOrOtherError(error: any, reqType: RequestType, url: string) {
    if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`${this.name}] ${reqType} ${url}: error.config`, error.config);
        }
        logData(`[${this.name}] ${reqType} ${url} : error.request`, error.request);
      }

      throw new Error(`[${this.name}] ${reqType} ${url} [no response] : ${error.message}`, {
        cause: error,
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      if (this.debug) {
        if (this.debugLevel === 'verbose') {
          logData(`[${this.name}] ${reqType} ${url} : error`, error);
        } else {
          console.log(`[${this.name}] ${reqType} ${url} error.message : ${error.message}`);
        }
      }

      if (error.message) {
        throw new Error(`[${this.name}] ${reqType} ${url} : ${error.message}`, {
          cause: error,
        });
      } else {
        throw new Error(error);
      }
    }
  }
}

/**
 * Base class for API errors.
 * @extends Error
 */
export class ApiResponseError extends Error {
  /**
   * The HTTP status code.
   */
  status: number;
  /**
   * The response text.
   */
  response: Record<string, any> | string;
  /**
   * The cause of the error. Usually a XiorError.
   */
  cause?: any;

  /**
   * Creates an instance of ApiError.
   * @param {string} message - The error message.
   * @param {number} status - The HTTP status code.
   * @param {object|string} response - The response.
   * @param {any} cause - The cause of the error.
   */
  constructor(message: string, status: number, response: object | string, cause?: any) {
    super(message, { cause });
    this.status = status;
    this.response = response;
  }
}
