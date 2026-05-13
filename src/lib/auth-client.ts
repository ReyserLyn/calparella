import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
  sessionOptions: {
    refetchInterval: 5 * 60,
    refetchOnWindowFocus: true,
  },
})

type ErrorTypes = Partial<Record<keyof typeof authClient.$ERROR_CODES, string>>

const errorCodes = {
  USER_NOT_FOUND: 'Usuario no encontrado.',
  FAILED_TO_CREATE_USER: 'Error al crear el usuario.',
  FAILED_TO_CREATE_SESSION: 'Error al iniciar sesión.',
  FAILED_TO_UPDATE_USER: 'Error al actualizar el usuario.',
  FAILED_TO_GET_SESSION: 'Error al obtener la sesión.',
  INVALID_PASSWORD: 'La contraseña es incorrecta.',
  INVALID_EMAIL: 'El correo electrónico no es válido.',
  INVALID_EMAIL_OR_PASSWORD: 'Correo o contraseña inválidos.',
  INVALID_USER: 'Usuario inválido.',
  PROVIDER_NOT_FOUND: 'Proveedor de autenticación no encontrado.',
  INVALID_TOKEN: 'El token es inválido.',
  TOKEN_EXPIRED: 'El token expiró.',
  USER_EMAIL_NOT_FOUND: 'No se encontró el correo electrónico.',
  EMAIL_NOT_VERIFIED: 'El correo electrónico no está verificado.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 8 caracteres.',
  PASSWORD_TOO_LONG: 'La contraseña es demasiado larga.',
  USER_ALREADY_EXISTS: 'Ya existe una cuenta con este correo.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya existe una cuenta con este correo. Usá otro.',
  EMAIL_CAN_NOT_BE_UPDATED: 'El correo no se puede modificar.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'Cuenta no encontrada.',
  SESSION_EXPIRED: 'La sesión expiró. Iniciá sesión de nuevo.',
  ACCOUNT_NOT_FOUND: 'Cuenta no encontrada.',
  SESSION_NOT_FRESH: 'La sesión no es reciente. Iniciá sesión de nuevo.',
  INVALID_CALLBACK_URL: 'URL de redirección inválida.',
  INVALID_ORIGIN: 'Origen inválido.',
  MISSING_FIELD: 'Completá todos los campos requeridos.',
  VALIDATION_ERROR: 'Error de validación.',
  EMAIL_ALREADY_VERIFIED: 'El correo electrónico ya está verificado.',
  PASSWORD_ALREADY_SET: 'El usuario ya tiene una contraseña.',
  FAILED_TO_CREATE_VERIFICATION: 'Error al crear la verificación.',
  CALLBACK_URL_REQUIRED: 'Se requiere una URL de redirección.',
} satisfies ErrorTypes

export function translateError(code?: string): string | undefined {
  if (code && code in errorCodes) {
    return errorCodes[code as keyof typeof errorCodes]
  }
  return undefined
}
