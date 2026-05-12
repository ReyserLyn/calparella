# CalParella Project

## ~Librerías~

- Astro 6
- Drizzle
- Better Auth
- Motion
- Cloudflare R2
- Cloudflare D1
- HugeIcons
- Embla Carrusel
- FontSource o Font API

## Despliegue

- Cloudflare Workers

## Requerimientos

- Debe haber Registro e inicio de sesión de usuarios
- Casa usuario puede crear un calendario como máximo
- Con un calendario creado, el dueño puede invitar a 1 usuario como administrador (Pareja) para poder editar
- Cada calendario se puede separar con slug (url) para poder ser compartido
- Cada calendario debe tener opción de hacerlo público ( cualquiera con el enlace puede verlo) o privado ( solo los administradores pueden verlo)
- El calendario se puede eliminar como acción irreversible
- Máximo 1 foto por mes en el calendario
- La página debe tener el diseño rosado claro o rosado oscuro, ambos themes.
- Usar Motion para animar SVG de corazones u otras decoraciónes
- Usar Astro Middleware para permisos
- Usar Astro Actions manipulando directamente cloudflare
- Usar Astro API para Better Auth

## Notas de Programador

- NO USAR REACT
- Priorizar Javascript y typescript
- El logo debe de ser ambos themes y letras principales "CA"
- Debe de ser instalable como app a pesar de ser web
- Diseño de Gris 3x4 con responsive
- Buscar librería para tomar screenshots o generar imágenes del album para exportar, compartir
- Buscar librería para decoraciones, similar a confeti
- En git crear 2 ramas, una de producción y otra de dev

## Extras

- Investigar encriptación E2E de ente y estudiar si es necesario en la App o si es mucha complejidad para MVP
