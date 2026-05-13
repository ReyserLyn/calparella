import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/schema'

export type Auth = ReturnType<typeof createAuth>

/**
 * Factory de Better Auth para Cloudflare Workers.
 *
 * Dos modos de uso:
 *   1. Sin argumentos → para CLI `auth generate` (lee export const auth)
 *   2. Con argumentos → para runtime en middleware
 */
export function createAuth(env?: Cloudflare.Env, ctx?: ExecutionContext, baseURL?: string) {
  const db = env ? drizzle(env.DB, { schema }) : drizzle({} as D1Database, { schema })

  // En el modo CLI (sin args), lee BETTER_AUTH_URL del entorno si existe
  const resolvedBaseURL = baseURL ?? BETTER_AUTH_URL

  return betterAuth({
    baseURL: resolvedBaseURL,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      camelCase: true,
      schema: schema,
      usePlural: true,
    }),

    session: {
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: true,
        maxAge: 15 * 60,
      },
      updateAge: 60 * 15,
    },

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },

    /**
     * Secondary storage y background tasks solo se activan en runtime
     * con bindings reales. El CLI no necesita esto.
     */
    ...(env
      ? {
          secondaryStorage: {
            get: async (key: string) => {
              try {
                return await env.SESSION.get(key)
              } catch {
                return null
              }
            },
            set: async (key: string, value: string, ttl?: number) => {
              try {
                const effectiveTtl = ttl ? Math.max(ttl, 60) : undefined
                await env.SESSION.put(
                  key,
                  value,
                  effectiveTtl ? { expirationTtl: effectiveTtl } : undefined,
                )
              } catch (e) {
                console.warn('[auth] KV set failed', { key, error: String(e) })
              }
            },
            delete: async (key: string) => {
              try {
                await env.SESSION.delete(key)
              } catch (e) {
                console.warn('[auth] KV delete failed', { key, error: String(e) })
              }
            },
          },
          rateLimit: {
            window: 60,
            max: 30,
            customStorage: {
              get: async (key: string) => {
                try {
                  const data = await env.SESSION.get(key)
                  return data ? JSON.parse(data) : undefined
                } catch {
                  return undefined
                }
              },
              set: async (key: string, value: unknown) => {
                try {
                  await env.SESSION.put(key, JSON.stringify(value), { expirationTtl: 60 })
                } catch (e) {
                  console.warn('[auth] Rate limit KV set failed', { key, error: String(e) })
                }
              },
              delete: async (key: string) => {
                try {
                  await env.SESSION.delete(key)
                } catch (e) {
                  console.warn('[auth] Rate limit KV delete failed', { key, error: String(e) })
                }
              },
            },
          },
        }
      : {}),

    advanced: {
      defaultCookieAttributes: {
        secure: true,
        sameSite: 'lax',
        httpOnly: true,
      },
      ...(ctx
        ? {
            backgroundTasks: {
              handler: (p: Promise<unknown>) =>
                ctx.waitUntil(
                  p.catch((err) => console.warn('[auth] Background task failed:', String(err))),
                ),
            },
          }
        : {}),
    },
  })
}

// Fallback para baseURL
const BETTER_AUTH_URL = typeof process !== 'undefined' ? process.env?.BETTER_AUTH_URL : undefined

// Export para CLI: bun x auth@latest generate
export const auth = createAuth()
