export {
  HttpClient,
  RequestType,
  HttpClientRequestConfig,
  HttpClientOptions,
  HttpClientResponse,
  HttpClientRetryConfig,
  IdempotencyConfig,
  ErrorMessageExtractor,
} from './http-client.js';

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
  classifyNetworkErrorType,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
  ErrorClassification,
} from './errors.js';

export { isXiorError, XiorError, XiorRequestConfig, XiorResponse } from 'xior';
