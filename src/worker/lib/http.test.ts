import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { errorResponse, zodHook } from './http'
import { postCreateSchema } from './schemas'

describe('API error helpers', () => {
  it('returns the standard error envelope', async () => {
    const app = new Hono()
    app.get('/', (c) => errorResponse(c, 409, 'conflict', 'Already exists', { field: 'email' }))

    const response = await app.request('/')
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'conflict',
        message: 'Already exists',
        details: { field: 'email' },
      },
    })
  })

  it('returns 422 with validation details for invalid JSON', async () => {
    const app = new Hono()
    app.post('/', zValidator('json', postCreateSchema, zodHook), (c) => c.json(c.req.valid('json')))

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    })

    expect(response.status).toBe(422)
    const json = await response.json() as {
      error: { code: string; message: string; details: { issues: unknown[] } }
    }
    expect(json.error.code).toBe('validation_failed')
    expect(json.error.message).toBe('Validation failed')
    expect(json.error.details.issues.length).toBeGreaterThan(0)
  })
})
