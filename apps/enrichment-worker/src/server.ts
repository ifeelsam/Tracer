/**
 * The enrichment server boots the Fastify webhook app for development and deployment.
 * Startup is isolated so the app can be reused in tests without opening a network listener.
 */
import { buildApp } from "./app"

async function start() {
  const app = buildApp()
  const port = Number.parseInt(process.env.PORT ?? "4002", 10)
  const host = process.env.HOST ?? "0.0.0.0"

  try {
    await app.listen({
      port,
      host,
    })
  } catch (error) {
    app.log.error(error)
    process.exitCode = 1
  }
}

void start()
