import crypto from 'node:crypto'

/**
 * Custom password hashing para Better Auth usando node:crypto.scryptSync.
 *
 * ¿Por qué scryptSync y no bcrypt/scrypt puro?
 *   Cloudflare Workers tiene un CPU time limit que el hashing puro en JS
 *   (tanto bcryptjs como @noble/hashes/scrypt) excede fácilmente.
 *   `scryptSync` es nativo (thread pool de libuv), no bloquea el event loop
 *   y es compatible con Workers gracias a `nodejs_compat`.
 *
 * Parámetros que usa Better Auth por defecto:
 *   N = 16384, r = 16, p = 1, dkLen = 64
 */

const SCRYPT_PARAMS = {
  N: 16384,
  r: 16,
  p: 1,
  maxmem: 128 * 16384 * 16 * 2, // ~67 MiB, seguro para Workers
}

const KEY_LEN = 64
const SALT_LEN = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN)
  const key = crypto.scryptSync(password.normalize('NFKC'), salt, KEY_LEN, SCRYPT_PARAMS)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(':')
  if (!saltHex || !keyHex) return false

  const key = crypto.scryptSync(
    password.normalize('NFKC'),
    Buffer.from(saltHex, 'hex'),
    KEY_LEN,
    SCRYPT_PARAMS,
  )

  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'))
}
