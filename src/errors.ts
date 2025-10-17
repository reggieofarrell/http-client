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
 */
export interface HttpErrorResponse {
  /** HTTP status code */
  status: number;
  /** HTTP status text (e.g., "Not Found", "Internal Server Error") */
  statusText: string;
  /** Response headers */
  headers: Record<string, any>;
  /** Response body/data */
  data: any;
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
 * HTTP error - thrown when the server responds with a 4xx or 5xx status code
 */
export class HttpError extends HttpClientError {
  /** HTTP status code */
  status: number;
  /** Error category for granular error handling */
  category: HttpErrorCategory;
  /** HTTP status text */
  statusText: string;
  /** Response object with headers and data */
  response: HttpErrorResponse;

  /**
   * Creates an instance of HttpError
   * @param message - Human-readable error message
   * @param status - HTTP status code
   * @param category - Error category
   * @param statusText - HTTP status text
   * @param response - Response object
   * @param metadata - Diagnostic metadata
   * @param cause - The original error that caused this error
   * @param isRetriable - Whether the error is retriable (determined automatically if not provided)
   */
  constructor(
    message: string,
    status: number,
    category: HttpErrorCategory,
    statusText: string,
    response: HttpErrorResponse,
    metadata: ErrorMetadata,
    cause?: any,
    isRetriable?: boolean
  ) {
    // Determine retriability if not explicitly provided
    const retriable =
      isRetriable !== undefined ? isRetriable : determineHttpErrorRetriability(status, category);

    super(message, 'HTTP_ERROR', metadata, retriable, cause);
    this.status = status;
    this.category = category;
    this.statusText = statusText;
    this.response = response;
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
export function buildHttpErrorResponse(response: XiorResponse): HttpErrorResponse {
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
  type: 'network' | 'timeout' | 'http' | 'serialization' | 'unknown';
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

  // Unknown error type
  return {
    type: 'unknown',
    isRetriable: false,
  };
}

/**
 * Helper function to detect serialization errors
 * @param error - The error to check
 * @returns true if the error indicates serialization failure
 */
function isSerializationError(error: any): boolean {
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
