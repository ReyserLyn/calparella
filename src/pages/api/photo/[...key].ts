import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { eq, and } from 'drizzle-orm'
import { calendars, calendarMembers } from '@/db/schema'
import { createClient } from '@/db'

/**
 * Sirve imágenes desde R2 con verificación de privacidad.
 * GET /api/photo/calendars/.../2026/1.png
 *
 * Solo sirve fotos de calendarios públicos.
 * Si el calendario es privado, requiere sesión y membresía.
 */
export const ALL: APIRoute = async (ctx) => {
  // params.key captura todo después de /api/photo/
  const key = (ctx.params.key || '').replace(/^\/+/, '')
  if (!key) return new Response('Missing key', { status: 400 })

  // Extraer calendarId del key: "calendars/{calendarId}/{year}/{month}.{ext}"
  const parts = key.split('/')
  if (parts.length < 4 || parts[0] !== 'calendars') {
    return new Response('Invalid key format', { status: 400 })
  }
  const calendarId = parts[1]

  // Verificar visibilidad del calendario
  const db = createClient(env.DB)
  const calendar = await db
    .select({ isPublic: calendars.isPublic, ownerId: calendars.ownerId })
    .from(calendars)
    .where(eq(calendars.id, calendarId))
    .get()

  if (!calendar) return new Response('Not found', { status: 404 })

  // Si es privado, verificar membresía
  if (!calendar.isPublic) {
    // El middleware ya valida la sesión y la expone en locals
    const user = ctx.locals?.user as { id: string } | undefined
    if (!user) return new Response('Unauthorized', { status: 401 })

    const member = await db
      .select({ userId: calendarMembers.userId })
      .from(calendarMembers)
      .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, user.id)))
      .get()

    const isOwner = calendar.ownerId === user.id
    if (!member && !isOwner) {
      return new Response('Forbidden', { status: 403 })
    }
  }

  // Servir desde R2
  const object = await env.CALPARELLA.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
