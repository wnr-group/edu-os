interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitEntry>();
const MAX_TRACKED_KEYS = 5000;

function pruneOld(timestamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  if (buckets.size > MAX_TRACKED_KEYS) {
    const firstKey = buckets.keys().next().value;
    if (firstKey !== undefined) buckets.delete(firstKey);
  }

  const entry = buckets.get(key) ?? { timestamps: [] };
  entry.timestamps = pruneOld(entry.timestamps, now, config.windowMs);

  if (entry.timestamps.length >= config.maxRequests) {
    buckets.set(key, entry);
    const oldest = entry.timestamps[0];
    return { allowed: false, retryAfterMs: Math.max(0, oldest + config.windowMs - now) };
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true, retryAfterMs: 0 };
}
