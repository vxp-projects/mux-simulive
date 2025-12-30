import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
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
  if (!redis) return null;

  try {
    const value = await redis.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    console.error("[Redis] Get error:", error);
    return null;
  }
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
  if (!redis) return false;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("[Redis] Set error:", error);
    return false;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}
