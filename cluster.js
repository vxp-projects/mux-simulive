const cluster = require("cluster");
const path = require("path");

// Fixed at 4 workers for predictable resource usage
const NUM_WORKERS = 4;

if (cluster.isPrimary) {
  console.log(`Primary process ${process.pid} starting`);
  console.log(`Spawning ${NUM_WORKERS} workers...`);

  // Track worker spawns to prevent infinite respawn loops
  const workerSpawns = new Map();
  const RESPAWN_WINDOW = 60000; // 1 minute
  const MAX_RESPAWNS = 5;

  function spawnWorker() {
    const worker = cluster.fork();
    console.log(`Worker ${worker.process.pid} started`);
    return worker;
  }

  // Initial spawn
  for (let i = 0; i < NUM_WORKERS; i++) {
    spawnWorker();
  }

  // Handle worker crashes with rate limiting
  cluster.on("exit", (worker, code, signal) => {
    const now = Date.now();
    const workerId = worker.id;

    console.log(
      `Worker ${worker.process.pid} exited (code: ${code}, signal: ${signal})`
    );

    // Track respawn rate
    const spawns = workerSpawns.get(workerId) || [];
    const recentSpawns = spawns.filter((t) => now - t < RESPAWN_WINDOW);

    if (recentSpawns.length >= MAX_RESPAWNS) {
      console.error(
        `Worker ${workerId} respawned ${MAX_RESPAWNS} times in ${RESPAWN_WINDOW / 1000}s, backing off...`
      );
      // Wait before respawning
      setTimeout(() => {
        workerSpawns.set(workerId, []);
        spawnWorker();
      }, 30000);
    } else {
      recentSpawns.push(now);
      workerSpawns.set(workerId, recentSpawns);
      spawnWorker();
    }
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 10000);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill("SIGINT");
    }
    setTimeout(() => process.exit(0), 5000);
  });
} else {
  // Worker process - run the Next.js standalone server
  console.log(`Worker ${process.pid} starting Next.js server`);

  // Set required environment variables for Next.js standalone
  process.env.PORT = process.env.PORT || "3000";
  process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

  // Load the standalone Next.js server (copied to root in Docker)
  require("./server.js");
}
