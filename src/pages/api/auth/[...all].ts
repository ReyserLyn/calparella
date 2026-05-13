import type { APIRoute } from 'astro'

/**
 * Catch-all API route para Better Auth.
 * Todos los endpoints de auth (/api/auth/*) pasan por aquí.
 */
export const ALL: APIRoute = async (ctx) => {
  const auth = ctx.locals.auth
  return auth.handler(ctx.request)
}
