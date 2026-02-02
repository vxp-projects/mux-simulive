import Redis from "ioredis";

let redisClient: Redis | null = null;

function requireRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }
  return redisUrl;
}

export function getRedisClient(): Redis {
  const redisUrl = requireRedisUrl();

  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => {
        // Retry with exponential backoff, max 3 seconds
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });
  }

  return redisClient;
}

/**
 * Get a cached value from Redis
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  const value = await redis.get(key);
  if (value) {
    return JSON.parse(value) as T;
  }
  return null;
}

/**
 * Set a cached value in Redis with TTL
 */
export async function setCached(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<boolean> {
  const redis = getRedisClient();
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
  return true;
}

/**
 * Check if Redis is available (sync check for env var)
 */
export function isRedisConfigured(): boolean {
  // Force runtime check - don't let Next.js optimize this away
  const url = process.env.REDIS_URL;
  return typeof url === "string" && url.length > 0;
}

/**
 * Check if Redis is actually connected/connectable (async)
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (!isRedisConfigured()) {
    return false;
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    return true;
  } catch (error) {
    console.error("[Redis] Availability check failed:", error);
    return false;
  }
}

/**
 * Delete a cached value from Redis
 */
export async function deleteCached(key: string): Promise<boolean> {
  const redis = getRedisClient();
  await redis.del(key);
  return true;
}

// ============================================
// Session Management
// ============================================

const SESSION_PREFIX = "session:";
const SESSION_TTL = 60 * 60 * 24; // 24 hours

/**
 * Create a new session and return the session ID
 */
export async function createSession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  await redis.setex(
    `${SESSION_PREFIX}${sessionId}`,
    SESSION_TTL,
    JSON.stringify({ createdAt: Date.now() })
  );
  return true;
}

/**
 * Validate a session exists
 */
export async function validateSession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  const exists = await redis.exists(`${SESSION_PREFIX}${sessionId}`);
  return exists === 1;
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  return deleteCached(`${SESSION_PREFIX}${sessionId}`);
}

// ============================================
// Rate Limiting
// ============================================

const RATE_LIMIT_PREFIX = "ratelimit:login:";
const RATE_LIMIT_WINDOW = 60 * 15; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

interface RateLimitResult {
  allowed: boolean;
  attemptsRemaining: number;
  retryAfterSeconds?: number;
}

/**
 * Check and increment login attempts for an IP
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedisClient();

  const key = `${RATE_LIMIT_PREFIX}${ip}`;

  const attempts = await redis.incr(key);

  // Set expiry on first attempt
  if (attempts === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }

  if (attempts > MAX_LOGIN_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      attemptsRemaining: 0,
      retryAfterSeconds: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
    };
  }

  return {
    allowed: true,
    attemptsRemaining: MAX_LOGIN_ATTEMPTS - attempts,
  };
}

/**
 * Reset rate limit for an IP (after successful login)
 */
export async function resetLoginRateLimit(ip: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${RATE_LIMIT_PREFIX}${ip}`);
}
