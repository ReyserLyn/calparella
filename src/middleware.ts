import { defineMiddleware } from 'astro:middleware'
import { env } from 'cloudflare:workers'
import { createAuth } from '@/lib/auth'

/**
 * Middleware de Astro que crea UNA instancia de Better Auth por request
 * y la guarda en Astro.locals para reutilizar en routes.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const ctx = context.locals.cfContext
  const baseURL = new URL(context.request.url).origin
  const auth = createAuth(env, ctx, baseURL)

  // Guardar la instancia en locals para que las routes la reutilicen
  context.locals.auth = auth

  // Verificar sesión y exponer user/session en locals
  const isAuthed = await auth.api.getSession({
    headers: context.request.headers,
  })

  if (isAuthed) {
    context.locals.user = isAuthed.user
    context.locals.session = isAuthed.session
  } else {
    context.locals.user = null
    context.locals.session = null
  }

  return next()
})
