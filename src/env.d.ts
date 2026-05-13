/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

type AuthInstance = ReturnType<typeof import('@/lib/auth').createAuth>

declare namespace App {
  interface Locals {
    cfContext: ExecutionContext
    auth: AuthInstance
    user: import('better-auth').User | null
    session: import('better-auth').Session | null
  }
}
