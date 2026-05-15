import { defineAction, ActionError } from 'astro:actions'
import { z } from 'astro/zod'
import { eq, and } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { calendars, calendarMembers, calendarPhotos } from '@/db/schema'
import { createClient } from '@/db'
import { createCalendarSchema } from '@/lib/calendar-schemas'

// ── Helpers ───────────────────────────────────────────────

function extFromType(type: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
  }
  return map[type] || '.jpg'
}

async function requireCalendarMember(userId: string, calendarId: string) {
  const db = createClient(env.DB)
  const member = await db
    .select({ id: calendarMembers.id })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.userId, userId), eq(calendarMembers.calendarId, calendarId)))
    .get()

  if (!member) {
    throw new ActionError({
      code: 'FORBIDDEN',
      message: 'No tienes permisos para modificar este calendario.',
    })
  }
  return member
}

// ── Schemas ────────────────────────────────────────────────

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']

const photoFileSchema = z
  .unknown()
  .refine((v) => v instanceof File, { error: 'Selecciona una foto.' })
  .refine((f) => (f as File).size <= 10 * 1024 * 1024, { error: 'La foto no debe superar 10 MB.' })
  .refine(
    (f) => {
      const file = f as File
      if (file.type && VALID_IMAGE_TYPES.includes(file.type)) return true
      // Si el browser no detectó el tipo, validar por extensión
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']
      return validExts.includes(ext)
    },
    { error: 'Solo imágenes: JPEG, PNG, WebP, AVIF, GIF.' },
  )

const uploadPhotoSchema = z.object({
  calendarId: z.string(),
  month: z.coerce.number().min(1).max(12),
  day: z.coerce.number().min(1, { error: 'Elige un día del mes.' }).max(31),
  caption: z.string().max(200).optional(),
  photo: photoFileSchema,
})

const deletePhotoSchema = z.object({
  calendarId: z.string(),
  month: z.coerce.number().min(1).max(12),
})

// ── Actions ────────────────────────────────────────────────

export const server = {
  createCalendar: defineAction({
    accept: 'form',
    input: createCalendarSchema,
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user)
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'Inicia sesión para crear un calendario.',
        })

      const db = createClient(env.DB)
      const year = new Date().getFullYear()
      let finalSlug = input.slug

      const existing = await db
        .select({ id: calendars.id })
        .from(calendars)
        .where(and(eq(calendars.ownerId, user.id), eq(calendars.year, year)))
        .get()

      if (existing)
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Ya tienes un calendario para este año.',
        })

      let counter = 0
      while (true) {
        const s = await db
          .select({ id: calendars.id })
          .from(calendars)
          .where(eq(calendars.slug, finalSlug))
          .get()
        if (!s) break
        counter++
        finalSlug = `${input.slug}-${counter}`
      }

      const id = crypto.randomUUID()
      const now = new Date()

      await db.insert(calendars).values({
        id,
        slug: finalSlug,
        name: input.name,
        year,
        ownerId: user.id,
        isPublic: input.isPublic,
        createdAt: now,
        updatedAt: now,
      })

      await db.insert(calendarMembers).values({
        id: crypto.randomUUID(),
        calendarId: id,
        userId: user.id,
        year,
        role: 'admin',
        joinedAt: now,
      })

      return { success: true }
    },
  }),

  /** Subir una foto a un mes del calendario */
  uploadPhoto: defineAction({
    accept: 'form',
    input: uploadPhotoSchema,
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      await requireCalendarMember(user.id, input.calendarId)

      const db = createClient(env.DB)
      const calendar = await db
        .select({ year: calendars.year })
        .from(calendars)
        .where(eq(calendars.id, input.calendarId))
        .get()
      if (!calendar)
        throw new ActionError({ code: 'NOT_FOUND', message: 'Calendario no encontrado.' })

      // Buscar foto existente en este mes
      const existing = await db
        .select({ id: calendarPhotos.id, imageKey: calendarPhotos.imageKey })
        .from(calendarPhotos)
        .where(
          and(
            eq(calendarPhotos.calendarId, input.calendarId),
            eq(calendarPhotos.month, input.month),
          ),
        )
        .get()

      const ext = extFromType(input.photo.type)
      const key = `calendars/${input.calendarId}/${calendar.year}/${input.month}${ext}`

      // 1. Subir nueva foto a R2 primero
      try {
        await env.CALPARELLA.put(key, input.photo, {
          httpMetadata: { contentType: input.photo.type },
        })
      } catch {
        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al subir la foto. Intenta de nuevo.',
        })
      }

      // 2. Actualizar DB
      const now = new Date()
      if (existing) {
        await db
          .update(calendarPhotos)
          .set({
            imageKey: key,
            imageUrl: undefined,
            caption: input.caption ?? null,
            day: input.day,
            uploadedBy: user.id,
            uploadedAt: now,
          })
          .where(eq(calendarPhotos.id, existing.id))
      } else {
        await db.insert(calendarPhotos).values({
          id: crypto.randomUUID(),
          calendarId: input.calendarId,
          month: input.month,
          day: input.day,
          imageKey: key,
          caption: input.caption ?? null,
          uploadedBy: user.id,
          uploadedAt: now,
        })
      }

      // 3. Borrar foto vieja de R2 (solo después de confirmar DB)
      if (existing) {
        try {
          await env.CALPARELLA.delete(existing.imageKey)
        } catch {
          /* no crítico: la vieja queda huérfana pero la nueva ya está en DB */
        }
      }

      return { success: true }
    },
  }),

  /** Eliminar una foto de un mes */
  deletePhoto: defineAction({
    accept: 'form',
    input: deletePhotoSchema,
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      await requireCalendarMember(user.id, input.calendarId)

      const db = createClient(env.DB)
      const photo = await db
        .select({ id: calendarPhotos.id, imageKey: calendarPhotos.imageKey })
        .from(calendarPhotos)
        .where(
          and(
            eq(calendarPhotos.calendarId, input.calendarId),
            eq(calendarPhotos.month, input.month),
          ),
        )
        .get()

      if (!photo)
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'No hay foto para eliminar en este mes.',
        })

      await env.CALPARELLA.delete(photo.imageKey)
      await db.delete(calendarPhotos).where(eq(calendarPhotos.id, photo.id))

      return { success: true }
    },
  }),
}
