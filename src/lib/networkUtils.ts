/**
 * Network Utilities for Offline Support
 * Provides timeout handling and network status detection
 */

export const NETWORK_TIMEOUT = 30000; // 30 seconds — PKCE flow needs multiple round-trips
export const SESSION_CHECK_COOLDOWN = 30000; // 30 seconds between focus checks

// Track last session check time to prevent spamming
let lastSessionCheck = 0;

/**
 * Check if enough time has passed since last session check
 */
export function shouldCheckSession(): boolean {
    const now = Date.now();
    if (now - lastSessionCheck < SESSION_CHECK_COOLDOWN) {
        console.log('⏳ [Network] Session check skipped (cooldown active)');
        return false;
    }
    lastSessionCheck = now;
    return true;
}

/**
 * Reset session check cooldown (call after successful check)
 */
export function resetSessionCheckCooldown(): void {
    lastSessionCheck = Date.now();
}

/**
 * Fetch with timeout wrapper.
 * If Supabase already passed its own signal, we race our timeout against it
 * instead of replacing it — this preserves Supabase's internal abort logic.
 */
export async function fetchWithTimeout(
    input: RequestInfo | URL,
    init?: RequestInit,
    timeout: number = NETWORK_TIMEOUT
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // If Supabase passed its own signal, link it so either one can abort
    if (init?.signal) {
        const externalSignal = init.signal as AbortSignal;
        if (externalSignal.aborted) {
            clearTimeout(timeoutId);
            throw new DOMException('Aborted', 'AbortError');
        }
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
        const response = await fetch(input, {
            ...init,
            signal: controller.signal, // our signal now also listens to Supabase's
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Create a custom fetch function with timeout for Supabase
 */
export function createTimeoutFetch(timeout: number = NETWORK_TIMEOUT): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        return fetchWithTimeout(input, init, timeout);
    };
}

/**
 * Check if a specific URL is reachable (with timeout)
 */
export async function isServerReachable(url: string, timeout: number = 5000): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
        });

        clearTimeout(timeoutId);
        return true;
    } catch (error) {
        console.warn('⚠️ [Network] Server unreachable:', url);
        return false;
    }
}

/**
 * Wrap a promise with a timeout
 */
export function withTimeout<T>(
    promise: Promise<T>,
    timeout: number = NETWORK_TIMEOUT,
    errorMessage: string = 'Request timed out'
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(errorMessage));
        }, timeout);

        promise
            .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

/**
 * Detect if error is a network/timeout error.
 * Intentionally does NOT include TypeError — that's too broad and catches
 * unrelated bugs (bad data parsing, undefined access, etc.) which then get
 * silently swallowed as "network errors" by AuthContext.
 */
export function isNetworkError(error: any): boolean {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    return (
        name === 'aborterror' ||
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('econnrefused')
    );
}