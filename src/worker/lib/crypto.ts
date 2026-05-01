/**
 * Crypto utilities for Cloudflare Workers.
 * Uses only the Web Crypto API (crypto.subtle) — no Node.js crypto imports.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** Encode an ArrayBuffer to a standard base64 string. */
function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

/** Decode a standard base64 string to a Uint8Array. */
function base64ToBuffer(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
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
