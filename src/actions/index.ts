import { defineAction, ActionError } from 'astro:actions'
import { eq, and } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { calendars, calendarMembers } from '@/db/schema'
import { createClient } from '@/db'
import { createCalendarSchema } from '@/lib/calendar-schemas'

export const server = {
  createCalendar: defineAction({
    accept: 'form',
    input: createCalendarSchema,
    handler: async (input, context) => {
      const user = context.locals.user
      if (!user) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'Iniciá sesión para crear un calendario.',
        })
      }

      const db = createClient(env.DB)
      const year = new Date().getFullYear()
      let finalSlug = input.slug

      const existing = await db
        .select({ id: calendars.id })
        .from(calendars)
        .where(and(eq(calendars.ownerId, user.id), eq(calendars.year, year)))
        .get()

      if (existing) {
        throw new ActionError({
          code: 'CONFLICT',
          message: 'Ya tenés un calendario para este año.',
        })
      }

      let counter = 0
      while (true) {
        const slugExists = await db
          .select({ id: calendars.id })
          .from(calendars)
          .where(eq(calendars.slug, finalSlug))
          .get()
        if (!slugExists) break
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
}
