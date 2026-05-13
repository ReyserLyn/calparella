# CalParella

Calendario compartido para parejas. Una foto por mes, un recuerdo por año.

## Stack

- **Runtime:** Astro 6 + Cloudflare Workers
- **Auth:** Better Auth (email/password + Google)
- **DB:** Cloudflare D1 + Drizzle ORM
- **Storage:** R2 (fotos mensuales)
- **Cache/Sessions:** KV (namespace SESSION)
- **Estilos:** Tailwind v4 (OKLCH, dark/light)
- **Iconos:** HugeIcons
- **Animaciones:** Motion
- **Carrusel:** Embla

## Features

### Auth

- Registro e inicio de sesión con email y contraseña
- Google OAuth (próximamente)

### Calendario (core)

- **1 calendario por pareja.** Un usuario puede crear o pertenecer a máximo un calendario.
- **Slug personalizable.** Se sugiere automáticamente basado en los nombres (ej. `reyser-y-marilyn`). Si existe duplicado, se añade sufijo numérico (`-1`, `-2`). El usuario puede cambiarlo cuando quiera, siempre único.
- **Público o privado.** Público: cualquiera con el enlace puede ver el calendario y los nombres. Privado: solo los administradores.
- **Invitación de pareja.** El dueño invita a 1 usuario como administrador (pareja) para co-editar.
- **1 foto por mes.** Una foto de pareja por mes. Si el mes ya tiene foto, se reemplaza.
- **Grid 3×4.** Vista principal responsiva: 12 casillas (una por mes).
- **Eliminar calendario.** Acción irreversible. Al eliminar la pareja, el dueño conserva el calendario y puede reemplazarla. También puede eliminar el calendario completo.

### UX

- Diseño rosado claro/oscuro (ambos themes)
- Layout de letras "CA" como logo
- PWA instalable
- Screenshots/exportación del álbum (próximamente)
- Decoraciones con confeti (próximamente)
- Grid 3×4 responsivo

## Arquitectura

- **Middleware:** permisos y verificación de sesión
- **Astro Actions:** lógica de negocio (CRUD calendario, invitaciones)
- **API routes:** Better Auth handler (`/api/auth/*`)
- **Slug routing:** `/calendario/[slug]` para vista pública/compartida

## Dev

- NO usar React
- Priorizar TypeScript
- Git: ramas `production` + `dev`

## Extras (post-MVP)

- Encriptación E2E (investigar ente)
- Impresión/exportación del álbum
- Confetti y animaciones decorativas
