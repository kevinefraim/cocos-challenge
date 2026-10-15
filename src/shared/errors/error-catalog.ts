import { HTTP_STATUS } from '../http/constants.js';
import { AppError } from './AppError.js';

const ERROR_DEFINITIONS = {
  AMOUNT_TOO_LOW: [HTTP_STATUS.BAD_REQUEST, 'Amount is too low to purchase one share'],
  DATABASE_UNAVAILABLE: [HTTP_STATUS.SERVICE_UNAVAILABLE, 'Database is unavailable'],
  INSTRUMENT_NOT_FOUND: [HTTP_STATUS.NOT_FOUND, 'Tradable instrument not found'],
  INTERNAL_ERROR: [HTTP_STATUS.INTERNAL_SERVER_ERROR, 'An unexpected error occurred'],
  INVALID_JSON: [HTTP_STATUS.BAD_REQUEST, 'Malformed JSON request body'],
  INVALID_ORDER: [HTTP_STATUS.BAD_REQUEST, 'Invalid order payload'],
  INVALID_ORDER_HISTORY: [HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Invalid order history'],
  INVALID_ORDER_ID: [HTTP_STATUS.BAD_REQUEST, 'Order ID must be a positive integer'],
  INVALID_QUERY: [HTTP_STATUS.BAD_REQUEST, 'Invalid instrument search query'],
  INVALID_USER_ID: [HTTP_STATUS.BAD_REQUEST, 'User ID must be a positive integer'],
  MARKET_DATA_UNAVAILABLE: [HTTP_STATUS.SERVICE_UNAVAILABLE, 'Market data is unavailable'],
  NOT_FOUND: [HTTP_STATUS.NOT_FOUND, 'Route not found'],
  ORDER_NOT_CANCELLABLE: [HTTP_STATUS.CONFLICT, 'Only NEW orders can be cancelled'],
  ORDER_NOT_FOUND: [HTTP_STATUS.NOT_FOUND, 'Order not found'],
  PAYLOAD_TOO_LARGE: [HTTP_STATUS.PAYLOAD_TOO_LARGE, 'Request body exceeds the allowed size'],
  QUANTITY_TOO_LARGE: [HTTP_STATUS.BAD_REQUEST, 'Order quantity exceeds the supported limit'],
  USER_NOT_FOUND: [HTTP_STATUS.NOT_FOUND, 'User not found'],
  UNSUPPORTED_MEDIA_TYPE: [
    HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
    'Unsupported JSON charset or content encoding',
  ],
  INVALID_REQUEST_BODY: [HTTP_STATUS.BAD_REQUEST, 'Invalid request body'],
} as const;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export function createAppError(
  code: ErrorCode,
  overrides: { message?: string; statusCode?: number } = {},
) {
  const [defaultStatusCode, defaultMessage] = ERROR_DEFINITIONS[code];
  return new AppError(
    code,
    overrides.statusCode ?? defaultStatusCode,
    overrides.message ?? defaultMessage,
  );
}
