/**
 * Async local storage keeps nested instrumentation attached to the active trace session.
 * Wrappers can look up the current session without threading it through every call site.
 */
import { AsyncLocalStorage } from "node:async_hooks"

import type { Session } from "./session"

const sessionStorage = new AsyncLocalStorage<Session>()

export function getCurrentSession(): Session | undefined {
  return sessionStorage.getStore()
}

export function runWithSession<T>(
  session: Session,
  callback: () => Promise<T> | T
): Promise<T> | T {
  return sessionStorage.run(session, callback)
}
