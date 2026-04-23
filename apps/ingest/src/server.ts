/**
 * The ingest server boots the Fastify app for local development and production deployment.
 * Keeping startup isolated makes the app itself easier to reuse in tests.
 */
import { buildApp } from "./app"

async function start() {
  const app = buildApp()
  const port = Number.parseInt(process.env.PORT ?? "4001", 10)
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
