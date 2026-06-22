/**
 * Client-side performance timing utility.
 * 
 * Wraps `performance.mark()` / `performance.measure()` with a simple API
 * for timing tab switches, renders, and fetches.
 * 
 * Only logs in development mode.
 */

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

const marks = new Map<string, number>()

/**
 * Start timing a named operation.
 */
export function perfStart(name: string): void {
    if (!isDev) return
    marks.set(name, performance.now())
    if (typeof performance?.mark === 'function') {
        performance.mark(`${name}-start`)
    }
}

/**
 * End timing a named operation and log the result.
 * Returns the elapsed time in ms.
 */
export function perfEnd(name: string, extra?: Record<string, any>): number {
    if (!isDev) return 0
    const start = marks.get(name)
    if (start === undefined) {
        console.warn(`[PERF] No start mark for "${name}"`)
        return 0
    }

    const elapsed = performance.now() - start
    marks.delete(name)

    if (typeof performance?.mark === 'function') {
        performance.mark(`${name}-end`)
        try {
            performance.measure(name, `${name}-start`, `${name}-end`)
        } catch {
            // Measure may fail if marks were cleared
        }
    }

    const ms = Math.round(elapsed)
    const status = ms < 300 ? '✅' : ms < 1000 ? '⚠️' : '❌'
    const extraStr = extra ? ` ${JSON.stringify(extra)}` : ''
    console.log(`[PERF] ${status} ${name}: ${ms}ms${extraStr}`)

    return elapsed
}

/**
 * Assert a timing threshold. Logs a warning if exceeded.
 */
export function perfAssert(name: string, maxMs: number, actualMs: number): boolean {
    if (!isDev) return true
    const passed = actualMs <= maxMs
    if (!passed) {
        console.warn(`[PERF:FAIL] ${name}: ${Math.round(actualMs)}ms exceeds ${maxMs}ms threshold`)
    }
    return passed
}
