import { z } from 'astro/zod'

/**
 * Schemas compartidos para el módulo de calendarios.
 * Se usan tanto en Astro Actions (server) como en validación client-side.
 */

/** Slugs reservados para evitar colisiones con rutas estáticas existentes. */
const RESERVED_SLUGS = new Set([
  'registro',
  'iniciar-sesion',
  'invitaciones',
  'invitacion',
  'calendario',
  'api',
  '404',
  'favicon',
  'robots',
  'sitemap',
  'index',
])

export const createCalendarSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'El nombre debe tener al menos 2 caracteres.' })
    .max(100, { error: 'El nombre es demasiado largo.' }),
  slug: z
    .string()
    .trim()
    .min(3, { error: 'El slug debe tener al menos 3 caracteres.' })
    .max(50, { error: 'El slug es demasiado largo.' })
    .regex(/^[a-z0-9-]+$/, {
      error: 'Solo letras minúsculas, números y guiones.',
    })
    .refine((val) => !RESERVED_SLUGS.has(val), {
      error: 'Ese nombre no está disponible. Elige otro.',
    }),
  isPublic: z.coerce.boolean().optional().default(false),
  description: z
    .string()
    .trim()
    .max(200, { error: 'La descripción no puede superar 200 caracteres.' })
    .optional(),
})
