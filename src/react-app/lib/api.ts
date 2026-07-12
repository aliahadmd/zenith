export type ApiResponse<T> = {
  data: T | null
  error: string | null
  status: number
  code?: string
  details?: unknown
}

type ApiErrorPayload =
  | { error?: string }
  | { error?: { code?: string; message?: string; details?: unknown } }

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(message: string, status: number, code = 'request_failed', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function normalizeApiError(json: ApiErrorPayload): Pick<ApiResponse<never>, 'error' | 'code' | 'details'> {
  if (typeof json.error === 'string') {
    return { error: json.error }
  }

  if (json.error && typeof json.error === 'object') {
    return {
      error: json.error.message ?? 'An error occurred',
      code: json.error.code,
      details: json.error.details,
    }
  }

  return { error: 'An error occurred' }
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const isFormData = options.body instanceof FormData

  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> ?? {}),
  }

  try {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    })

    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('unauthorized'))
    }

    let data: T | null = null
    let error: string | null = null
    let code: string | undefined
    let details: unknown

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json = await res.json()
      if (res.ok) {
        data = json as T
      } else {
        const normalized = normalizeApiError(json as ApiErrorPayload)
        error = normalized.error
        code = normalized.code
        details = normalized.details
        if (code === 'account_suspended' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('account-suspended'))
        }
      }
    } else if (!res.ok) {
      error = res.statusText || 'An error occurred'
    }

    return { data, error, status: res.status, code, details }
  } catch {
    return { data: null, error: 'Network error', status: 0 }
  }
}

export function apiGet<T>(url: string): Promise<ApiResponse<T>> {
  return apiFetch<T>(url, { method: 'GET' })
}

export function apiPost<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiFetch<T>(url, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

export function apiPut<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiFetch<T>(url, {
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

export function apiPatch<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiFetch<T>(url, {
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

export function apiDelete<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiFetch<T>(url, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) })
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const { data, error, status, code, details } = await apiFetch<T>(url, options)

  if (error || !data) {
    throw new ApiError(error ?? 'Empty response', status, code, details)
  }

  return data
}

export function apiGetRequired<T>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: 'GET' })
}

export function apiPostRequired<T>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

export function apiPutRequired<T>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

export function apiPatchRequired<T>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

export function apiDeleteRequired<T>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) })
}
