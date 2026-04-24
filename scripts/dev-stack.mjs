#!/usr/bin/env node
/**
 * Local dev stack runner for Tracer.
 * Spawns each service in its own process group and forwards signals for clean shutdown.
 */
import { spawn } from "node:child_process";

const processes = [];

function run(label, cwd, command, args) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  processes.push({ label, child });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[dev-stack] ${label} exited with code ${code}`);
      shutdown(code);
    }
  });
}

function shutdown(exitCode = 0) {
  for (const { child } of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const root = process.cwd();

// Core request path
run("ingest", `${root}/apps/ingest`, "pnpm", ["dev"]);
run("server", `${root}/apps/server`, "pnpm", ["dev"]);
run("dashboard", `${root}/apps/dashboard`, "pnpm", ["dev"]);

// Background workers
run("analysis-worker", `${root}/apps/server`, "pnpm", ["analysis:worker"]);
run("anchor-worker", `${root}/apps/anchor-worker`, "pnpm", ["dev"]);
run("enrichment-worker", `${root}/apps/enrichment-worker`, "pnpm", ["dev"]);

