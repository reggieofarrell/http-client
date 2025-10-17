export {
  HttpClient,
  RequestType,
  HttpClientRequestConfig,
  HttpClientOptions,
  HttpClientResponse,
  HttpClientRetryConfig,
} from './http-client.js';

export {
  HttpClientError,
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError,
  HttpErrorCategory,
  classifyHttpError,
  isTimeoutError,
  isSerializationError,
  classifyNetworkErrorType,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
  ErrorClassification,
} from './errors.js';

export { isXiorError, XiorError, XiorRequestConfig, XiorResponse } from 'xior';
