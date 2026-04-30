/**
 * Crypto utilities for Cloudflare Workers.
 * Uses only the Web Crypto API (crypto.subtle) — no Node.js crypto imports.
 */

export type JwtPayload = {
  sub: string
  email: string
  role: 'subscriber' | 'creator'
  iat: number
  exp: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Encode an ArrayBuffer to a standard base64 string. */
function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

/** Decode a standard base64 string to a Uint8Array. */
function base64ToBuffer(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** Encode an ArrayBuffer to a base64url string (no padding, URL-safe chars). */
function bufferToBase64url(buffer: ArrayBuffer): string {
  return bufferToBase64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Encode a plain string to a base64url string. */
function stringToBase64url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return bufferToBase64url(bytes.buffer as ArrayBuffer)
}

/** Decode a base64url string to a plain string. */
function base64urlToString(b64url: string): string {
  // Restore standard base64 padding and characters
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64url.length + ((4 - (b64url.length % 4)) % 4),
    '='
  )
  return atob(b64)
}

// ── Password hashing ───────────────────────────────────────────────────────

/**
 * Hash a password using PBKDF2-HMAC-SHA256.
 * Returns a self-describing string:
 *   `pbkdf2:sha256:100000:<base64(salt)>:<base64(derivedKey)>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: 100_000,
    },
    keyMaterial,
    256 // 32 bytes
  )

  const saltB64 = bufferToBase64(salt.buffer as ArrayBuffer)
  const dkB64 = bufferToBase64(derivedBits)

  return `pbkdf2:sha256:100000:${saltB64}:${dkB64}`
}

/**
 * Verify a password against a stored PBKDF2 hash string.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const parts = hash.split(':')
    if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
      return false
    }

    const iterations = parseInt(parts[2], 10)
    const salt = base64ToBuffer(parts[3])
    const storedDk = base64ToBuffer(parts[4])

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations,
      },
      keyMaterial,
      256 // 32 bytes
    )

    const derivedDk = new Uint8Array(derivedBits)

    // Constant-time comparison: use crypto.subtle.timingSafeEqual if available,
    // otherwise fall back to byte-by-byte comparison that doesn't short-circuit.
    if (typeof (crypto.subtle as unknown as Record<string, unknown>).timingSafeEqual === 'function') {
      return (crypto.subtle as unknown as { timingSafeEqual: (a: ArrayBuffer, b: ArrayBuffer) => boolean })
        .timingSafeEqual(derivedBits, storedDk.buffer as ArrayBuffer)
    }

    if (derivedDk.length !== storedDk.length) {
      return false
    }

    let diff = 0
    for (let i = 0; i < derivedDk.length; i++) {
      diff |= derivedDk[i] ^ storedDk[i]
    }
    return diff === 0
  } catch {
    return false
  }
}

// ── JWT ────────────────────────────────────────────────────────────────────

/**
 * Sign a JWT using HMAC-SHA256.
 * Sets `exp` to `iat + 7 days` if not already set.
 */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }

  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + 7 * 24 * 60 * 60,
  }

  const headerB64 = stringToBase64url(JSON.stringify(header))
  const payloadB64 = stringToBase64url(JSON.stringify(fullPayload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const signatureB64 = bufferToBase64url(signature)

  return `${signingInput}.${signatureB64}`
}

/**
 * Verify a JWT and return its payload, or null if invalid/expired.
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [headerB64, payloadB64, signatureB64] = parts
    const signingInput = `${headerB64}.${payloadB64}`

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // Decode the base64url signature back to bytes
    const signatureBytes = base64ToBuffer(
      signatureB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
        signatureB64.length + ((4 - (signatureB64.length % 4)) % 4),
        '='
      )
    )

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput)
    )

    if (!valid) {
      return null
    }

    const payload = JSON.parse(base64urlToString(payloadB64)) as JwtPayload

    // Check expiry
    if (!payload.exp || payload.exp < Date.now() / 1000) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
