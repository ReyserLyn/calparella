import { defineAction, ActionError } from 'astro:actions'
import { z } from 'astro/zod'
import { eq, and, gt } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { calendars, calendarMembers, calendarPhotos, invitations, users } from '@/db/schema'
import { createClient } from '@/db'
import { createCalendarSchema, updateCalendarSchema } from '@/lib/calendar-schemas'
import slugify from 'slugify'

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

async function requireCalendarOwner(userId: string, calendarId: string) {
  const db = createClient(env.DB)
  const calendar = await db
    .select({ ownerId: calendars.ownerId })
    .from(calendars)
    .where(eq(calendars.id, calendarId))
    .get()

  if (!calendar || calendar.ownerId !== userId) {
    throw new ActionError({
      code: 'FORBIDDEN',
      message: 'Solo el dueño puede realizar esta acción.',
    })
  }
  return calendar
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
        description: input.description || null,
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

      return { success: true, slug: finalSlug }
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

  // ── Invitations ──────────────────────────────────────────────

  /** Crear invitación para unirse al calendario */
  sendInvitation: defineAction({
    accept: 'form',
    input: z.object({
      calendarId: z.string(),
      inviteeEmail: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      const db = createClient(env.DB)
      const email = input.inviteeEmail?.trim() || ''
      const isLinkOnly = !email

      // Validar email solo si se proporcionó
      if (!isLinkOnly && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Ingresa un correo electrónico válido.',
        })
      }

      // Verificar que el calendario existe y el usuario es owner
      const calendar = await db
        .select({ id: calendars.id, ownerId: calendars.ownerId })
        .from(calendars)
        .where(eq(calendars.id, input.calendarId))
        .get()

      if (!calendar)
        throw new ActionError({ code: 'NOT_FOUND', message: 'Calendario no encontrado.' })
      if (calendar.ownerId !== user.id) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'Solo el dueño puede invitar.' })
      }

      // Verificar que no haya ya 2 miembros
      const memberCount = await db
        .select({ id: calendarMembers.id })
        .from(calendarMembers)
        .where(eq(calendarMembers.calendarId, input.calendarId))
        .all()

      if (memberCount.length >= 2) {
        throw new ActionError({ code: 'CONFLICT', message: 'Este calendario ya tiene pareja.' })
      }

      // Verificar que no haya invitación pendiente activa
      const now = new Date()
      const existingPending = await db
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.calendarId, input.calendarId),
            eq(invitations.status, 'pending'),
            gt(invitations.expiresAt, now),
          ),
        )
        .get()

      if (existingPending) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Ya tienes una invitación pendiente. Cancélala primero.',
        })
      }

      // Si se proporcionó email, verificar que no sea ya miembro
      if (!isLinkOnly) {
        const existingMember = await db
          .select({ id: calendarMembers.id })
          .from(calendarMembers)
          .innerJoin(users, eq(users.id, calendarMembers.userId))
          .where(and(eq(calendarMembers.calendarId, input.calendarId), eq(users.email, email)))
          .get()

        if (existingMember) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Este usuario ya es miembro del calendario.',
          })
        }
      }

      const token = crypto.randomUUID()
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      await db.insert(invitations).values({
        id: crypto.randomUUID(),
        calendarId: input.calendarId,
        inviterId: user.id,
        inviteeEmail: email,
        token,
        role: 'admin',
        status: 'pending',
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })

      return { success: true, token }
    },
  }),

  /** Aceptar invitación por token */
  acceptInvitation: defineAction({
    accept: 'form',
    input: z.object({
      token: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      const db = createClient(env.DB)
      const now = new Date()

      const invitation = await db
        .select({
          id: invitations.id,
          calendarId: invitations.calendarId,
          inviteeEmail: invitations.inviteeEmail,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
          role: invitations.role,
        })
        .from(invitations)
        .where(eq(invitations.token, input.token))
        .get()

      if (!invitation) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Invitación no encontrada.' })
      }

      // Verificar expiración
      if (new Date(invitation.expiresAt) < now) {
        await db
          .update(invitations)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(invitations.id, invitation.id))
        throw new ActionError({ code: 'GONE', message: 'Esta invitación ha expirado.' })
      }

      if (invitation.status !== 'pending') {
        throw new ActionError({
          code: 'CONFLICT',
          message: `Esta invitación ya fue ${invitation.status === 'accepted' ? 'aceptada' : invitation.status === 'cancelled' ? 'cancelada' : 'rechazada'}.`,
        })
      }

      // Verificar que el usuario coincide con el email (solo si la invitación tiene email)
      const isLinkInvite = !invitation.inviteeEmail
      if (!isLinkInvite && invitation.inviteeEmail !== user.email) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Esta invitación es para otro email.',
        })
      }

      // Verificar que no sea ya miembro
      const existingMember = await db
        .select({ id: calendarMembers.id })
        .from(calendarMembers)
        .where(
          and(
            eq(calendarMembers.calendarId, invitation.calendarId),
            eq(calendarMembers.userId, user.id),
          ),
        )
        .get()

      if (existingMember) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Ya eres miembro de este calendario.',
        })
      }

      // Verificar que el calendario no tenga ya 2 miembros
      const members = await db
        .select({ id: calendarMembers.id })
        .from(calendarMembers)
        .where(eq(calendarMembers.calendarId, invitation.calendarId))
        .all()

      if (members.length >= 2) {
        throw new ActionError({ code: 'CONFLICT', message: 'Este calendario ya tiene pareja.' })
      }

      const calendar = await db
        .select({
          id: calendars.id,
          slug: calendars.slug,
          year: calendars.year,
          ownerId: calendars.ownerId,
        })
        .from(calendars)
        .where(eq(calendars.id, invitation.calendarId))
        .get()

      if (!calendar) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Calendario no encontrado.' })
      }

      // Traspaso: si el usuario ya pertenece a otro calendario, salir de él primero
      const oldMembership = await db
        .select({ id: calendarMembers.id, calendarId: calendarMembers.calendarId })
        .from(calendarMembers)
        .where(eq(calendarMembers.userId, user.id))
        .get()

      if (oldMembership) {
        // Verificar si es owner de su calendario actual
        const oldCalendar = await db
          .select({ id: calendars.id, ownerId: calendars.ownerId })
          .from(calendars)
          .where(eq(calendars.id, oldMembership.calendarId))
          .get()

        if (oldCalendar?.ownerId === user.id) {
          // Es dueño: eliminar el calendario viejo (las fotos y la invitación se van en cascada)
          await db.delete(calendars).where(eq(calendars.id, oldCalendar.id))
        } else {
          // Solo miembro: eliminar su membresía vieja
          await db.delete(calendarMembers).where(eq(calendarMembers.id, oldMembership.id))
        }
      }

      // Insertar como miembro del nuevo calendario
      await db.insert(calendarMembers).values({
        id: crypto.randomUUID(),
        calendarId: invitation.calendarId,
        userId: user.id,
        year: calendar.year,
        role: invitation.role,
        joinedAt: now,
      })

      // Marcar invitación como aceptada
      await db
        .update(invitations)
        .set({ status: 'accepted', inviteeId: user.id, updatedAt: now })
        .where(eq(invitations.id, invitation.id))

      return { success: true, calendarId: invitation.calendarId, calendarSlug: calendar.slug }
    },
  }),

  /** Cancelar invitación pendiente */
  cancelInvitation: defineAction({
    accept: 'form',
    input: z.object({
      invitationId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      const db = createClient(env.DB)

      const invitation = await db
        .select({
          id: invitations.id,
          inviterId: invitations.inviterId,
          status: invitations.status,
        })
        .from(invitations)
        .where(eq(invitations.id, input.invitationId))
        .get()

      if (!invitation) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Invitación no encontrada.' })
      }

      if (invitation.inviterId !== user.id) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'No puedes cancelar esta invitación.' })
      }

      if (invitation.status !== 'pending') {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Esta invitación ya no está pendiente.',
        })
      }

      await db
        .update(invitations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(invitations.id, input.invitationId))

      return { success: true }
    },
  }),

  /** Obtener invitación por token (público) */
  getInvitation: defineAction({
    accept: 'json',
    input: z.object({
      token: z.string(),
    }),
    handler: async (input) => {
      const db = createClient(env.DB)
      const now = new Date()

      const result = await db
        .select({
          id: invitations.id,
          calendarId: invitations.calendarId,
          inviteeEmail: invitations.inviteeEmail,
          status: invitations.status,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
        })
        .from(invitations)
        .where(eq(invitations.token, input.token))
        .get()

      if (!result) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Invitación no encontrada.' })
      }

      const calendar = await db
        .select({ name: calendars.name, year: calendars.year, slug: calendars.slug })
        .from(calendars)
        .where(eq(calendars.id, result.calendarId))
        .get()

      const inviter = await db
        .select({ name: users.name })
        .from(users)
        .innerJoin(invitations, eq(invitations.inviterId, users.id))
        .where(eq(invitations.id, result.id))
        .get()

      const isExpired = new Date(result.expiresAt) < now
      const status = isExpired && result.status === 'pending' ? 'expired' : result.status

      return {
        id: result.id,
        calendarId: result.calendarId,
        inviteeEmail: result.inviteeEmail,
        status,
        expiresAt: result.expiresAt,
        createdAt: result.createdAt,
        calendarName: calendar?.name ?? '',
        calendarYear: calendar?.year ?? 0,
        calendarSlug: calendar?.slug ?? '',
        inviterName: inviter?.name ?? '',
      }
    },
  }),

  /** Ocultar invitación de la UI (soft-delete) */
  hideInvitation: defineAction({
    accept: 'form',
    input: z.object({
      invitationId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      const db = createClient(env.DB)

      const invitation = await db
        .select({
          id: invitations.id,
          inviterId: invitations.inviterId,
          status: invitations.status,
        })
        .from(invitations)
        .where(eq(invitations.id, input.invitationId))
        .get()

      if (!invitation) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Invitación no encontrada.' })
      }

      if (invitation.inviterId !== user.id) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'No puedes ocultar esta invitación.' })
      }

      await db
        .update(invitations)
        .set({ hidden: true, updatedAt: new Date() })
        .where(eq(invitations.id, input.invitationId))

      return { success: true }
    },
  }),

  // ── Calendar Settings ───────────────────────────────────────

  /** Actualizar información del calendario */
  updateCalendar: defineAction({
    accept: 'form',
    input: updateCalendarSchema,
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      await requireCalendarMember(user.id, input.calendarId)

      const db = createClient(env.DB)
      const now = new Date()

      const calendar = await db
        .select({ id: calendars.id, slug: calendars.slug, name: calendars.name })
        .from(calendars)
        .where(eq(calendars.id, input.calendarId))
        .get()

      if (!calendar) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Calendario no encontrado.' })
      }

      let finalSlug = input.slug

      // Si updateSlugFromName está activo, recalcular slug desde el nombre
      if (input.updateSlugFromName) {
        finalSlug = slugify(input.name, { lower: true, strict: true })
      }

      // Validar que el nuevo slug no esté en uso por OTRO calendario
      if (finalSlug !== calendar.slug) {
        const existing = await db
          .select({ id: calendars.id })
          .from(calendars)
          .where(eq(calendars.slug, finalSlug))
          .get()

        if (existing) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Ese slug ya está en uso. Elige otro.',
          })
        }
      }

      try {
        await db
          .update(calendars)
          .set({
            name: input.name,
            slug: finalSlug,
            description: input.description || null,
            isPublic: input.isPublic,
            updatedAt: now,
          })
          .where(eq(calendars.id, input.calendarId))
      } catch {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Ese slug ya está en uso. Elige otro.',
        })
      }

      return { success: true, newSlug: finalSlug !== calendar.slug ? finalSlug : undefined }
    },
  }),

  /** Eliminar calendario completamente (con limpieza de R2) */
  deleteCalendar: defineAction({
    accept: 'form',
    input: z.object({
      calendarId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      await requireCalendarOwner(user.id, input.calendarId)

      const db = createClient(env.DB)

      // 1. Obtener todas las fotos para borrar de R2
      const photos = await db
        .select({ imageKey: calendarPhotos.imageKey })
        .from(calendarPhotos)
        .where(eq(calendarPhotos.calendarId, input.calendarId))
        .all()

      // 2. Borrar fotos de R2
      for (const photo of photos) {
        try {
          await env.CALPARELLA.delete(photo.imageKey)
        } catch {
          // Si falla, continuamos — no bloqueamos la eliminación
        }
      }

      // 3. Borrar calendario de D1 (cascada: members, photos, invitations)
      await db.delete(calendars).where(eq(calendars.id, input.calendarId))

      return { success: true }
    },
  }),

  /** Eliminar pareja del calendario (solo owner) */
  removeMember: defineAction({
    accept: 'form',
    input: z.object({
      calendarId: z.string(),
      memberUserId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      await requireCalendarOwner(user.id, input.calendarId)

      if (input.memberUserId === user.id) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'No puedes eliminarte a ti mismo. Para salir, elimina el calendario.',
        })
      }

      const db = createClient(env.DB)

      const member = await db
        .select({ id: calendarMembers.id })
        .from(calendarMembers)
        .where(
          and(
            eq(calendarMembers.calendarId, input.calendarId),
            eq(calendarMembers.userId, input.memberUserId),
          ),
        )
        .get()

      if (!member) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Este usuario no es miembro del calendario.',
        })
      }

      await db.delete(calendarMembers).where(eq(calendarMembers.id, member.id))

      return { success: true }
    },
  }),

  /** Salir del calendario (miembro, no owner) */
  leaveCalendar: defineAction({
    accept: 'form',
    input: z.object({
      calendarId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      const db = createClient(env.DB)

      // Verificar que es miembro
      const member = await db
        .select({ id: calendarMembers.id, userId: calendarMembers.userId })
        .from(calendarMembers)
        .where(
          and(
            eq(calendarMembers.calendarId, input.calendarId),
            eq(calendarMembers.userId, user.id),
          ),
        )
        .get()

      if (!member) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'No eres miembro de este calendario.' })
      }

      // Verificar que NO es el owner
      const calendar = await db
        .select({ ownerId: calendars.ownerId })
        .from(calendars)
        .where(eq(calendars.id, input.calendarId))
        .get()

      if (calendar?.ownerId === user.id) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'El dueño no puede abandonar el calendario. Elimínalo si quieres salir.',
        })
      }

      await db.delete(calendarMembers).where(eq(calendarMembers.id, member.id))

      return { success: true }
    },
  }),

  /** Transferir ownership al partner */
  transferOwnership: defineAction({
    accept: 'form',
    input: z.object({
      calendarId: z.string(),
      newOwnerId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Inicia sesión.' })

      await requireCalendarOwner(user.id, input.calendarId)

      if (input.newOwnerId === user.id) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Ya eres el dueño del calendario.',
        })
      }

      const db = createClient(env.DB)

      // Verificar que el nuevo dueño es miembro del calendario
      const newOwnerMember = await db
        .select({ id: calendarMembers.id })
        .from(calendarMembers)
        .where(
          and(
            eq(calendarMembers.calendarId, input.calendarId),
            eq(calendarMembers.userId, input.newOwnerId),
          ),
        )
        .get()

      if (!newOwnerMember) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'El usuario no es miembro de este calendario.',
        })
      }

      await db
        .update(calendars)
        .set({ ownerId: input.newOwnerId, updatedAt: new Date() })
        .where(eq(calendars.id, input.calendarId))

      return { success: true }
    },
  }),
}
