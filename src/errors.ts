import type { XiorRequestConfig, XiorResponse } from 'xior';

/**
 * Enum for HTTP error categories
 */
export enum HttpErrorCategory {
  /** Authentication errors (401, 403) */
  AUTHENTICATION = 'AUTHENTICATION',
  /** Not found errors (404) */
  NOT_FOUND = 'NOT_FOUND',
  /** Rate limit errors (429) */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Validation errors (400, 422) */
  VALIDATION = 'VALIDATION',
  /** Other client errors (4xx) */
  CLIENT_ERROR = 'CLIENT_ERROR',
  /** Server errors (5xx) */
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Base metadata structure for all errors
 */
export interface ErrorMetadata {
  /** Information about the request that triggered the error */
  request: {
    /** HTTP method (GET, POST, etc.) */
    method: string;
    /** Request URL path */
    url: string;
    /** Base URL of the API */
    baseURL: string;
    /** Request headers */
    headers: Record<string, any>;
    /** Request timeout in milliseconds (if configured) */
    timeout?: number;
    /** ISO timestamp when the request was made */
    timestamp: string;
  };
  /** Number of retry attempts made (if applicable) */
  retryCount?: number;
  /** Name of the HttpClient instance that made the request */
  clientName: string;
}

/**
 * Additional metadata for network and timeout errors
 */
export interface NetworkErrorMetadata extends ErrorMetadata {
  /** Details about the underlying error */
  error: {
    /** Error code from the network layer (e.g., ECONNREFUSED, ETIMEDOUT) */
    code?: string;
    /** Raw error message */
    message: string;
    /** Classification of the error type */
    type: string;
  };
}

/**
 * Response object for HTTP errors
 * @typeParam TErrorBody - Shape of the response body, if known. Defaults to `unknown` so a
 * caller must explicitly narrow it (e.g. `error.response.data as MyApiErrorBody`) rather than
 * silently treating it as `any`.
 */
export interface HttpErrorResponse<TErrorBody = unknown> {
  /** HTTP status code */
  status: number;
  /** HTTP status text (e.g., "Not Found", "Internal Server Error") */
  statusText: string;
  /** Response headers */
  headers: Record<string, any>;
  /** Response body/data */
  data: TErrorBody;
}

/**
 * Base class for all HTTP client errors
 * Provides common properties and functionality for error handling
 */
export abstract class HttpClientError extends Error {
  /** Error code for programmatic handling */
  code: string;
  /** Whether this error type is retriable */
  isRetriable: boolean;
  /** Diagnostic metadata about the request and error */
  metadata: ErrorMetadata;
  /** The original error that caused this error */
  cause?: any;

  /**
   * Creates an instance of HttpClientError
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param metadata - Diagnostic metadata
   * @param isRetriable - Whether the error is retriable (can be overridden)
   * @param cause - The original error that caused this error
   */
  constructor(
    message: string,
    code: string,
    metadata: ErrorMetadata,
    isRetriable: boolean,
    cause?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.metadata = metadata;
    this.isRetriable = isRetriable;
    if (cause) {
      this.cause = cause;
    }

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Network error - thrown when network connectivity issues prevent a response
 * Examples: DNS lookup failure, connection refused, network unreachable
 */
export class NetworkError extends HttpClientError {
  /**
   * Creates an instance of NetworkError
   * @param message - Human-readable error message
   * @param metadata - Diagnostic metadata including error details
   * @param cause - The original error that caused this error
   * @param isRetriable - Whether the error is retriable (defaults to true)
   */
  constructor(
    message: string,
    metadata: NetworkErrorMetadata,
    cause?: any,
    isRetriable: boolean = true
  ) {
    super(message, 'NETWORK_ERROR', metadata, isRetriable, cause);
  }
}

/**
 * Timeout error - thrown when a request exceeds its timeout duration
 */
export class TimeoutError extends HttpClientError {
  /**
   * Creates an instance of TimeoutError
   * @param message - Human-readable error message
   * @param metadata - Diagnostic metadata including error details
   * @param cause - The original error that caused this error
   * @param isRetriable - Whether the error is retriable (defaults to true)
   */
  constructor(
    message: string,
    metadata: NetworkErrorMetadata,
    cause?: any,
    isRetriable: boolean = true
  ) {
    super(message, 'TIMEOUT_ERROR', metadata, isRetriable, cause);
  }
}

/**
 * Construction options for {@link HttpError}.
 *
 * Everything that used to be a positional constructor argument lives here so callers
 * (and this library's own `processError` path) can name each field at the call site.
 *
 * @typeParam TErrorBody - Shape of `response.data`, matching `HttpError<TErrorBody>`.
 */
export interface HttpErrorOptions<TErrorBody = unknown> {
  /** Human-readable error message (often extracted from the response body or status text) */
  message: string;
  /** HTTP status code from the failed response */
  status: number;
  /** Coarse category derived from the status (auth, rate limit, server error, etc.) */
  category: HttpErrorCategory;
  /** HTTP status text from the failed response */
  statusText: string;
  /** Parsed response (status, headers, body) attached to the error */
  response: HttpErrorResponse<TErrorBody>;
  /** Request/client diagnostic metadata */
  metadata: ErrorMetadata;
  /** Underlying transport/xior error, when available */
  cause?: unknown;
  /**
   * Explicit retriability override. When omitted, retriability is derived from
   * `status`/`category` via `determineHttpErrorRetriability`.
   */
  isRetriable?: boolean;
}

/**
 * HTTP error - thrown when the server responds with a 4xx or 5xx status code
 * @typeParam TErrorBody - Shape of the error response body, if known. Defaults to `unknown`.
 * Not tied to any request method's type parameter - provide it yourself at the catch site.
 *
 * Note: plain `error instanceof HttpError` narrows `response.data` to `any`, not `unknown` -
 * TypeScript substitutes `any` for a generic class's unspecified type parameters during
 * `instanceof` narrowing, regardless of the class's own default. Use the `isHttpError<T>()`
 * type guard below instead to actually get `response.data: T` (or `unknown` if you omit `T`).
 */
export class HttpError<TErrorBody = unknown> extends HttpClientError {
  /** HTTP status code */
  status: number;
  /** Error category for granular error handling */
  category: HttpErrorCategory;
  /** HTTP status text */
  statusText: string;
  /** Response object with headers and data */
  response: HttpErrorResponse<TErrorBody>;

  /**
   * Creates an `HttpError` from a single options object.
   *
   * All fields live on the options bag (rather than a long positional list) so construction
   * stays readable and stays well under Sonar's parameter-count limit (S107). `isRetriable`
   * is optional: omit it to derive retriability from `status`/`category`; pass `false`
   * explicitly when you need to override a normally-retriable status.
   *
   * @param options - Message, HTTP details, metadata, and optional cause/retriability
   */
  constructor(options: HttpErrorOptions<TErrorBody>) {
    // Prefer an explicit override when provided; otherwise derive from status/category.
    // `??` (not `||`) so a deliberate `false` override is preserved (S6606 / S7735).
    const retriable =
      options.isRetriable ?? determineHttpErrorRetriability(options.status, options.category);

    super(options.message, 'HTTP_ERROR', options.metadata, retriable, options.cause);
    this.status = options.status;
    this.category = options.category;
    this.statusText = options.statusText;
    this.response = options.response;
  }
}

/**
 * Type guard for `HttpError` that also types its error response body.
 *
 * Prefer this over a plain `error instanceof HttpError` check when you want `response.data`
 * typed as something other than `unknown` - TypeScript's `instanceof` narrowing against a
 * generic class always resolves unspecified type parameters to `any`, so `instanceof HttpError`
 * alone silently gives you an untyped `response.data` no matter what `HttpError`'s own default
 * is.
 * @param error - The value to check
 * @returns true if `error` is an `HttpError`, narrowing it to `HttpError<TErrorBody>`
 * @example
 * ```typescript
 * interface StripeErrorBody {
 *   error: { message: string; type: string };
 * }
 *
 * try {
 *   await client.post('/charge', payload);
 * } catch (error) {
 *   if (isHttpError<StripeErrorBody>(error)) {
 *     console.log(error.response.data.error.message); // typed
 *   }
 * }
 * ```
 */
export function isHttpError<TErrorBody = unknown>(error: unknown): error is HttpError<TErrorBody> {
  return error instanceof HttpError;
}

/**
 * Abort error - thrown when a request is deliberately cancelled via an AbortController/AbortSignal
 * Not retriable by default: retrying a request the caller just cancelled would defeat the purpose.
 */
export class AbortError extends HttpClientError {
  /**
   * Creates an instance of AbortError
   * @param message - Human-readable error message
   * @param metadata - Diagnostic metadata including error details
   * @param cause - The original error that caused this error
   * @param isRetriable - Whether the error is retriable (defaults to false)
   */
  constructor(
    message: string,
    metadata: NetworkErrorMetadata,
    cause?: any,
    isRetriable: boolean = false
  ) {
    super(message, 'ABORT_ERROR', metadata, isRetriable, cause);
  }
}

/**
 * Serialization error - thrown when request or response data cannot be serialized/deserialized
 */
export class SerializationError extends HttpClientError {
  /**
   * Creates an instance of SerializationError
   * @param message - Human-readable error message
   * @param metadata - Diagnostic metadata
   * @param cause - The original error that caused this error
   * @param isRetriable - Whether the error is retriable (defaults to false)
   */
  constructor(message: string, metadata: ErrorMetadata, cause?: any, isRetriable: boolean = false) {
    super(message, 'SERIALIZATION_ERROR', metadata, isRetriable, cause);
  }
}

/**
 * Classifies an HTTP status code into a category
 * @param status - HTTP status code
 * @returns The appropriate HttpErrorCategory
 */
export function classifyHttpError(status: number): HttpErrorCategory {
  // Authentication errors
  if (status === 401 || status === 403) {
    return HttpErrorCategory.AUTHENTICATION;
  }

  // Not found
  if (status === 404) {
    return HttpErrorCategory.NOT_FOUND;
  }

  // Rate limit
  if (status === 429) {
    return HttpErrorCategory.RATE_LIMIT;
  }

  // Validation errors
  if (status === 400 || status === 422) {
    return HttpErrorCategory.VALIDATION;
  }

  // Other client errors
  if (status >= 400 && status < 500) {
    return HttpErrorCategory.CLIENT_ERROR;
  }

  // Server errors
  if (status >= 500 && status < 600) {
    return HttpErrorCategory.SERVER_ERROR;
  }

  // Fallback for unexpected status codes
  return HttpErrorCategory.CLIENT_ERROR;
}

/**
 * Determines if an HTTP error should be retriable based on status and category
 * @param status - HTTP status code
 * @param category - Error category
 * @returns true if the error should be retriable by default
 */
export function determineHttpErrorRetriability(
  status: number,
  category: HttpErrorCategory
): boolean {
  // Server errors (5xx) are retriable
  if (category === HttpErrorCategory.SERVER_ERROR) {
    return true;
  }

  // Rate limit errors (429) are retriable
  if (category === HttpErrorCategory.RATE_LIMIT) {
    return true;
  }

  // 408 Request Timeout is retriable
  if (status === 408) {
    return true;
  }

  // All other errors are not retriable by default
  return false;
}

/**
 * Checks if an error is a deliberate abort (AbortController.abort() / AbortSignal),
 * as distinct from a timeout - xior surfaces its own timeouts as a differently-named
 * error, so this only matches a genuine caller-initiated cancellation.
 * @param error - The error to check
 * @returns true if the error indicates the request was aborted
 */
export function isAbortError(error: any): boolean {
  return error?.name === 'AbortError';
}

/**
 * Checks if an error is a timeout error based on error code or message
 * @param error - The error to check
 * @returns true if the error indicates a timeout
 */
export function isTimeoutError(error: any): boolean {
  // Check error code
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    return true;
  }

  // Check error message
  const message = error.message?.toLowerCase() || '';
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('time out')
  ) {
    return true;
  }

  // Check if xior marked it as a timeout
  if (error.isTimeout || error.__CANCEL__) {
    return true;
  }

  return false;
}

/**
 * Classifies the type of network error for metadata
 * @param error - The error to classify
 * @returns A string describing the error type
 */
export function classifyNetworkErrorType(error: any): string {
  const code = error.code;

  if (isAbortError(error)) {
    return 'aborted';
  }

  if (code === 'ECONNREFUSED') {
    return 'connection_refused';
  }

  if (code === 'ENOTFOUND') {
    return 'dns_lookup_failed';
  }

  if (code === 'ECONNRESET') {
    return 'connection_reset';
  }

  if (code === 'ECONNABORTED') {
    return 'connection_aborted';
  }

  if (code === 'ENETUNREACH') {
    return 'network_unreachable';
  }

  if (code === 'EHOSTUNREACH') {
    return 'host_unreachable';
  }

  if (isTimeoutError(error)) {
    return 'request_timeout';
  }

  return 'network_error';
}

/**
 * Builds error metadata from request config and client info
 * @param config - Xior request config
 * @param clientName - Name of the HTTP client
 * @param retryCount - Number of retry attempts (optional)
 * @returns ErrorMetadata object
 */
export function buildErrorMetadata(
  config: XiorRequestConfig,
  clientName: string,
  retryCount?: number
): ErrorMetadata {
  return {
    request: {
      method: (config.method || 'GET').toUpperCase(),
      url: config.url || '',
      baseURL: config.baseURL || '',
      headers: config.headers || {},
      ...(config.timeout !== undefined && { timeout: config.timeout }),
      timestamp: new Date().toISOString(),
    },
    ...(retryCount !== undefined && { retryCount }),
    clientName,
  };
}

/**
 * Builds network error metadata from request config, client info, and error details
 * @param config - Xior request config
 * @param clientName - Name of the HTTP client
 * @param error - The original error
 * @param retryCount - Number of retry attempts (optional)
 * @returns NetworkErrorMetadata object
 */
export function buildNetworkErrorMetadata(
  config: XiorRequestConfig,
  clientName: string,
  error: any,
  retryCount?: number
): NetworkErrorMetadata {
  const baseMetadata = buildErrorMetadata(config, clientName, retryCount);

  return {
    ...baseMetadata,
    error: {
      code: error.code,
      message: error.message || 'Unknown error',
      type: classifyNetworkErrorType(error),
    },
  };
}

/**
 * Builds HTTP error response object from Xior response
 * @param response - Xior response object
 * @returns HttpErrorResponse object
 */
export function buildHttpErrorResponse<TErrorBody = unknown>(
  response: XiorResponse
): HttpErrorResponse<TErrorBody> {
  return {
    status: response.status,
    statusText: response.statusText || '',
    headers: response.headers || {},
    data: response.data,
  };
}

/**
 * Error classification result for retry evaluation
 */
export interface ErrorClassification {
  /** The type of error detected */
  type: 'network' | 'timeout' | 'http' | 'serialization' | 'abort' | 'unknown';
  /** Whether the error should be retriable by default */
  isRetriable: boolean;
  /** HTTP status code (for HTTP errors) */
  status?: number;
  /** Error category (for HTTP errors) */
  category?: HttpErrorCategory;
}

/**
 * Classifies an error for retry evaluation, providing structured information
 * about the error type and retriability without creating full error instances.
 *
 * This function is designed to be used in the `enableRetry` callback to provide
 * access to our error type logic during retry evaluation.
 *
 * @param error - The error to classify (typically a XiorError)
 * @returns Structured error classification information
 *
 * @example
 * ```typescript
 * const client = new HttpClient({
 *   baseURL: 'https://api.example.com',
 *   retryConfig: {
 *     retries: 3,
 *     enableRetry: (config, error) => {
 *       const classification = classifyErrorForRetry(error);
 *
 *       if (classification.type === 'http' && classification.category === HttpErrorCategory.RATE_LIMIT) {
 *         return true; // Always retry rate limits
 *       }
 *
 *       return classification.isRetriable;
 *     }
 *   }
 * });
 * ```
 */
export function classifyErrorForRetry(error: any): ErrorClassification {
  // Check for a deliberate abort first - never retry a request the caller just cancelled
  if (isAbortError(error)) {
    return {
      type: 'abort',
      isRetriable: false,
    };
  }

  // Check for timeout errors first
  if (isTimeoutError(error)) {
    return {
      type: 'timeout',
      isRetriable: true,
    };
  }

  // Check for serialization errors
  if (isSerializationError(error)) {
    return {
      type: 'serialization',
      isRetriable: false,
    };
  }

  // Check for HTTP errors (has response)
  if (error.response) {
    const status = error.response.status;
    const category = classifyHttpError(status);
    const isRetriable = determineHttpErrorRetriability(status, category);

    return {
      type: 'http',
      isRetriable,
      status,
      category,
    };
  }

  // Check for network errors (no response, but has request)
  if (error.request) {
    return {
      type: 'network',
      isRetriable: true,
    };
  }

  // No response and no `.request` marker - this is what a genuine, unwrapped fetch()
  // failure looks like (a native TypeError from fetch() itself never gets a `.request`
  // property attached, unlike an already-wrapped XiorError). This is still a network-layer
  // failure and matches what HttpClient.processError's fallback actually throws for it -
  // a NetworkError, retriable by default - so treat it the same way here rather than
  // silently refusing to retry it.
  return {
    type: 'unknown',
    isRetriable: true,
  };
}

/**
 * Helper function to detect serialization errors
 * @param error - The error to check
 * @returns true if the error indicates serialization failure
 */
export function isSerializationError(error: any): boolean {
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

  // Check for specific error types. Note: TypeError is deliberately excluded here -
  // fetch() itself rejects with a plain TypeError for every network-layer failure
  // (offline, DNS failure, connection refused/reset, CORS block, mixed-content block)
  // in both browsers and Node's undici, so treating TypeError as a serialization
  // signature misclassifies the most common transport failure as non-retriable.
  if (error.name === 'SyntaxError') {
    return true;
  }

  return false;
}
