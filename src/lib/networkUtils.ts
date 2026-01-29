/**
 * Network Utilities for Offline Support
 * Provides timeout handling and network status detection
 */

export const NETWORK_TIMEOUT = 10000; // 10 seconds
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
 * Fetch with timeout wrapper
 * Prevents requests from hanging indefinitely when server is unreachable
 */
export async function fetchWithTimeout(
    input: RequestInfo | URL,
    init?: RequestInit,
    timeout: number = NETWORK_TIMEOUT
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(input, {
            ...init,
            signal: controller.signal,
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
 * Detect if error is a network/timeout error
 */
export function isNetworkError(error: any): boolean {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';

    return (
        name === 'aborterror' ||
        name === 'typeerror' ||
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('econnrefused')
    );
}
