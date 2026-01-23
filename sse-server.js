const http = require("http");
const { PrismaClient } = require("@prisma/client");
const Redis = require("ioredis");

const STREAM_EVENTS_CHANNEL = "stream:events:";
const HEARTBEAT_INTERVAL_MS = 30000;

const prisma = new PrismaClient();
const clientsBySlug = new Map();
const encoder = new TextEncoder();
let heartbeatTimer = null;
let subscriber = null;
let subscriberReady = null;

function ensureRedisUrl() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }
  return redisUrl;
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const payload = encoder.encode(`: heartbeat ${Date.now()}\n\n`);
    for (const [slug, clients] of clientsBySlug.entries()) {
      for (const res of Array.from(clients)) {
        if (!writeToClient(res, payload)) {
          clients.delete(res);
        }
      }
      if (clients.size === 0) {
        clientsBySlug.delete(slug);
      }
    }
    if (clientsBySlug.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function writeToClient(res, payload) {
  if (res.writableEnded) return false;
  try {
    const ok = res.write(payload);
    if (!ok) {
      res.end();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function removeClient(slug, res) {
  const clients = clientsBySlug.get(slug);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    clientsBySlug.delete(slug);
  }
  if (clientsBySlug.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function closeSlugClients(slug) {
  const clients = clientsBySlug.get(slug);
  if (!clients) return;
  for (const res of Array.from(clients)) {
    try {
      res.end();
    } catch {
      // Ignore
    }
  }
  clientsBySlug.delete(slug);
  if (clientsBySlug.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function broadcastEvent(slug, eventName, payload) {
  const clients = clientsBySlug.get(slug);
  if (!clients || clients.size === 0) return;

  const message = encoder.encode(`event: ${eventName}\ndata: ${payload}\n\n`);
  for (const res of Array.from(clients)) {
    if (!writeToClient(res, message)) {
      clients.delete(res);
    }
  }

  if (eventName === "stopped") {
    setTimeout(() => closeSlugClients(slug), 100);
  }
}

async function ensureSubscriber() {
  if (subscriberReady) return subscriberReady;

  subscriberReady = (async () => {
    subscriber = new Redis(ensureRedisUrl(), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    subscriber.on("error", (error) => {
      console.error("[SSE] Redis subscriber error:", error.message);
    });

    subscriber.on("pmessage", (_pattern, channel, message) => {
      if (!channel.startsWith(STREAM_EVENTS_CHANNEL)) return;
      const slug = channel.slice(STREAM_EVENTS_CHANNEL.length);
      if (!slug) return;
      try {
        const event = JSON.parse(message);
        if (!event?.type) return;
        broadcastEvent(slug, event.type, message);
      } catch (error) {
        console.error("[SSE] Failed to parse stream event:", error);
      }
    });

    await subscriber.psubscribe(`${STREAM_EVENTS_CHANNEL}*`);
  })();

  return subscriberReady;
}

function isSsePath(pathname) {
  return pathname.startsWith("/api/streams/") && pathname.endsWith("/events");
}

function extractStreamId(pathname) {
  const parts = pathname.split("/");
  return parts.length >= 5 ? parts[3] : null;
}

async function handleSseRequest(req, res, streamId) {
  let stream;
  try {
    stream = await prisma.stream.findFirst({
      where: { OR: [{ id: streamId }, { slug: streamId }] },
      select: { slug: true, endedAt: true },
    });
  } catch (error) {
    console.error("[SSE] Failed to resolve stream:", error);
    res.writeHead(500);
    res.end("Failed to resolve stream");
    return;
  }

  if (!stream) {
    res.writeHead(404);
    res.end("Stream not found");
    return;
  }

  if (stream.endedAt) {
    const payload = JSON.stringify({ endedAt: stream.endedAt });
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    res.end(`event: stopped\ndata: ${payload}\n\n`);
    return;
  }

  try {
    ensureRedisUrl();
  } catch {
    res.writeHead(503);
    res.end("Redis is required");
    return;
  }

  try {
    await ensureSubscriber();
  } catch (error) {
    console.error("[SSE] Failed to subscribe to Redis:", error);
    res.writeHead(503);
    res.end("Redis is required");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.socket?.setTimeout(0);
  res.socket?.setKeepAlive(true);
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const connectedPayload = encoder.encode(
    `event: connected\ndata: ${JSON.stringify({ slug: stream.slug })}\n\n`
  );
  writeToClient(res, connectedPayload);

  let clients = clientsBySlug.get(stream.slug);
  if (!clients) {
    clients = new Set();
    clientsBySlug.set(stream.slug, clients);
  }
  clients.add(res);
  ensureHeartbeat();

  const cleanup = () => removeClient(stream.slug, res);
  req.on("close", cleanup);
  req.on("error", cleanup);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  if (url.pathname === "/sse-health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }

  if (!isSsePath(url.pathname)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const streamId = extractStreamId(url.pathname);
  if (!streamId) {
    res.writeHead(400);
    res.end("Missing stream id");
    return;
  }

  await handleSseRequest(req, res, streamId);
});

const port = Number.parseInt(process.env.SSE_PORT || "4000", 10);
const host = process.env.SSE_HOST || "0.0.0.0";

server.listen(port, host, () => {
  console.log(`[SSE] listening on http://${host}:${port}`);
});

async function shutdown(signal) {
  console.log(`[SSE] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  if (subscriber) {
    try {
      subscriber.disconnect();
    } catch {
      // Ignore
    }
  }
  try {
    await prisma.$disconnect();
  } catch {
    // Ignore
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
