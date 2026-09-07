export type {
  HttpClientRequestConfig,
  HttpClientOptions,
  HttpClientResponse,
  HttpClientRetryConfig,
  IdempotencyConfig,
  ErrorMessageExtractor,
} from './http-client.js';
export { HttpClient, RequestType } from './http-client.js';

export type {
  HttpErrorOptions,
  HttpErrorResponse,
  ErrorMetadata,
  ErrorClassification,
} from './errors.js';
export {
  HttpClientError,
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError,
  AbortError,
  HttpErrorCategory,
  classifyHttpError,
  isTimeoutError,
  isSerializationError,
  isAbortError,
  isHttpError,
  classifyNetworkErrorType,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
} from './errors.js';

export type { XiorRequestConfig, XiorResponse } from 'xior';
export { isXiorError, XiorError } from 'xior';
