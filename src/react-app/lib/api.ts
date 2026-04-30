type ApiResponse<T> = {
  data: T | null
  error: string | null
  status: number
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

    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('unauthorized'))
    }

    let data: T | null = null
    let error: string | null = null

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json = await res.json()
      if (res.ok) {
        data = json as T
      } else {
        error = (json as { error?: string }).error ?? 'An error occurred'
      }
    } else if (!res.ok) {
      error = res.statusText || 'An error occurred'
    }

    return { data, error, status: res.status }
  } catch (err) {
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
