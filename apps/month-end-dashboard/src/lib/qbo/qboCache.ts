/**
 * Server-side in-memory cache for QBO API responses.
 * 
 * Two-tier:
 *  - Raw QBO responses:  10-minute TTL  (keyed by orgId + reportType + dateRange)
 *  - Parsed/aggregates:  30-minute TTL  (same key, stored alongside raw)
 *
 * This is a per-process cache, which is fine for a single-server Next.js deployment.
 * For multi-instance deployments, replace with Redis.
 */

type CacheEntry<T = any> = {
    data: T
    timestamp: number
    ttl: number
}

const cache = new Map<string, CacheEntry>()

// Max entries to prevent unbounded growth
const MAX_ENTRIES = 200

// Default TTLs (milliseconds)
export const QBO_RAW_TTL = 10 * 60 * 1000     // 10 minutes
export const QBO_DERIVED_TTL = 30 * 60 * 1000  // 30 minutes
export const QBO_METADATA_TTL = 60 * 60 * 1000 // 1 hour (chart of accounts, etc.)

/**
 * Build a cache key from parts
 */
export function cacheKey(...parts: string[]): string {
    return parts.join('|')
}

/**
 * Get a cached value. Returns undefined on miss or expiry.
 */
export function cacheGet<T = any>(key: string): { data: T; age: number } | undefined {
    const entry = cache.get(key)
    if (!entry) return undefined

    const age = Date.now() - entry.timestamp
    if (age > entry.ttl) {
        cache.delete(key)
        return undefined
    }

    return { data: entry.data as T, age }
}

/**
 * Set a cached value with TTL.
 */
export function cacheSet<T = any>(key: string, data: T, ttl: number = QBO_RAW_TTL): void {
    // Evict oldest entries if at capacity
    if (cache.size >= MAX_ENTRIES) {
        let oldest: string | null = null
        let oldestTime = Infinity
        for (const [k, v] of cache) {
            if (v.timestamp < oldestTime) {
                oldestTime = v.timestamp
                oldest = k
            }
        }
        if (oldest) cache.delete(oldest)
    }

    cache.set(key, { data, timestamp: Date.now(), ttl })
}

/**
 * Wrap an async function with caching.
 * Returns cached data if available, otherwise calls fn() and caches the result.
 */
export async function withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = QBO_RAW_TTL
): Promise<{ data: T; cached: boolean; latencyMs: number }> {
    const hit = cacheGet<T>(key)
    if (hit) {
        return { data: hit.data, cached: true, latencyMs: 0 }
    }

    const t0 = Date.now()
    const data = await fn()
    const latencyMs = Date.now() - t0

    cacheSet(key, data, ttl)

    return { data, cached: false, latencyMs }
}

/**
 * Invalidate cache entries matching a prefix (e.g., clear all for an org)
 */
export function cacheInvalidate(prefix: string): number {
    let count = 0
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key)
            count++
        }
    }
    return count
}

/**
 * Get cache stats for debugging
 */
export function cacheStats(): { size: number; keys: string[] } {
    return { size: cache.size, keys: [...cache.keys()] }
}
