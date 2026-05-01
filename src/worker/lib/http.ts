import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal_server_error'

type ErrorBody = {
  error: {
    code: ErrorCode | string
    message: string
    details?: unknown
  }
}

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode | string,
  message: string,
  details?: unknown,
) {
  const body: ErrorBody = { error: { code, message } }
  if (details !== undefined) body.error.details = details
  return c.json(body, status)
}

export function validationError(c: Context, error: { issues?: unknown }) {
  return errorResponse(
    c,
    422,
    'validation_failed',
    'Validation failed',
    { issues: error.issues ?? [] },
  )
}

export function badRequest(c: Context, message = 'Bad request', details?: unknown) {
  return errorResponse(c, 400, 'bad_request', message, details)
}

export function unauthorized(c: Context, message = 'Unauthorized') {
  return errorResponse(c, 401, 'unauthorized', message)
}

export function forbidden(c: Context, message = 'Forbidden') {
  return errorResponse(c, 403, 'forbidden', message)
}

export function notFound(c: Context, message = 'Not found') {
  return errorResponse(c, 404, 'not_found', message)
}

export function conflict(c: Context, message: string) {
  return errorResponse(c, 409, 'conflict', message)
}

export function payloadTooLarge(c: Context, message: string) {
  return errorResponse(c, 413, 'payload_too_large', message)
}

export function unsupportedMediaType(c: Context, message: string) {
  return errorResponse(c, 415, 'unsupported_media_type', message)
}

export function serverError(c: Context, message = 'Internal server error') {
  return errorResponse(c, 500, 'internal_server_error', message)
}

export const zodHook = (result: { success: boolean; error?: { issues?: unknown } }, c: Context) => {
  if (!result.success) return validationError(c, result.error ?? {})
}
