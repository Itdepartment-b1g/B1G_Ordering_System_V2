// ============================================================================
// SECURITY UTILITIES
// ============================================================================
// Token monitoring, input sanitization, and security helpers
// ============================================================================

/**
 * Monitor auth token for tampering
 */
let tokenMonitorInterval: NodeJS.Timeout | null = null;
let lastKnownToken: string | null = null;

export function startTokenMonitoring(onTampered: () => void): void {
  // Get the Supabase token key from localStorage
  // Check for our custom key first, then fall back to default Supabase keys
  const tokenKey = Object.keys(localStorage).find(key =>
    key === 'supabase.auth.token' || 
    (key.startsWith('sb-') && key.includes('auth-token'))
  );

  if (!tokenKey) {
    console.warn('⚠️ [Security] No auth token found in localStorage');
    return;
  }

  console.log(`🔒 [Security] Monitoring token key: ${tokenKey}`);

  // Store initial token
  lastKnownToken = localStorage.getItem(tokenKey);

  // Clear any existing monitor
  if (tokenMonitorInterval) {
    clearInterval(tokenMonitorInterval);
  }

  // Check every 5 seconds
  tokenMonitorInterval = setInterval(() => {
    const currentToken = localStorage.getItem(tokenKey);

    // If token changed (and it's not a legitimate refresh)
    if (currentToken !== lastKnownToken && currentToken !== null) {
      try {
        // Parse both tokens to check if it's a refresh or tampering
        const oldParsed = lastKnownToken ? JSON.parse(lastKnownToken) : null;
        const newParsed = currentToken ? JSON.parse(currentToken) : null;

        // If access_token changed but it's not from a refresh, it might be tampering
        if (oldParsed?.access_token !== newParsed?.access_token) {
          // Check if it looks like a valid refresh (has refresh_token, expires_at, etc.)
          if (!newParsed?.refresh_token || !newParsed?.expires_at) {
            console.error('🚨 [Security] Possible token tampering detected!');
            onTampered();
            return;
          }
        }

        // Update last known token (legitimate refresh)
        lastKnownToken = currentToken;
      } catch (error) {
        console.error('❌ [Security] Error parsing tokens:', error);
      }
    }
  }, 5000);

  console.log('🔒 [Security] Token monitoring started');
}

export function stopTokenMonitoring(): void {
  if (tokenMonitorInterval) {
    clearInterval(tokenMonitorInterval);
    tokenMonitorInterval = null;
    console.log('🔓 [Security] Token monitoring stopped');
  }
}

/**
 * Simple HTML sanitization (basic XSS protection)
 * For production, consider using DOMPurify library
 */
export function sanitizeHTML(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    const value = sanitized[key];

    if (typeof value === 'string') {
      sanitized[key] = sanitizeHTML(value) as any;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'string' ? sanitizeHTML(item) :
          typeof item === 'object' && item !== null ? sanitizeObject(item) :
            item
      ) as any;
    }
  }

  return sanitized;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Philippine format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Philippine format: +63 9XX-XXX-XXXX or variations
  const cleanPhone = phone.replace(/[\s-]/g, '');
  const phoneRegex = /^(\+63|0)?9\d{9}$/;
  return phoneRegex.test(cleanPhone);
}

/**
 * Clean localStorage of deprecated/unnecessary items
 */
export function cleanupLocalStorage(): void {
  try {
    // Remove old/deprecated cache keys
    const deprecatedKeys = ['user', 'isAdmin', 'remittanceRemi'];

    deprecatedKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`🗑️ [Security] Removed deprecated key: ${key}`);
      }
    });
  } catch (error) {
    console.error('❌ [Security] Error cleaning localStorage:', error);
  }
}

/**
 * Check if running in secure context (HTTPS)
 */
export function isSecureContext(): boolean {
  return window.isSecureContext || window.location.protocol === 'https:';
}

/**
 * Log security event (can be extended to send to monitoring service)
 */
export function logSecurityEvent(event: string, details?: Record<string, any>): void {
  console.warn(`🔒 [Security Event] ${event}`, details || '');

  // TODO: Send to monitoring service (e.g., Sentry, LogRocket)
  // Example: sendToMonitoring({ event, details, timestamp: Date.now() });
}

/**
 * Rate limiting helper (simple client-side)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // Reset or create new entry
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxAttempts) {
    logSecurityEvent('Rate limit exceeded', { key, attempts: entry.count });
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Clear rate limit for a key
 */
export function clearRateLimit(key: string): void {
  rateLimitMap.delete(key);
}

/**
 * Get the Supabase auth token key from localStorage
 */
export function getAuthTokenKey(): string | null {
  const tokenKey = Object.keys(localStorage).find(key =>
    key === 'supabase.auth.token' || 
    (key.startsWith('sb-') && key.includes('auth-token'))
  );
  return tokenKey || null;
}

/**
 * Check if auth token exists in localStorage
 */
export function hasAuthToken(): boolean {
  const tokenKey = getAuthTokenKey();
  if (!tokenKey) return false;
  
  const token = localStorage.getItem(tokenKey);
  if (!token) return false;
  
  try {
    const parsed = JSON.parse(token);
    return !!parsed?.access_token;
  } catch {
    return false;
  }
}

/**
 * Get auth token info (for debugging)
 */
export function getAuthTokenInfo(): { key: string | null; hasToken: boolean; expiresAt?: number } {
  const tokenKey = getAuthTokenKey();
  if (!tokenKey) {
    return { key: null, hasToken: false };
  }
  
  const token = localStorage.getItem(tokenKey);
  if (!token) {
    return { key: tokenKey, hasToken: false };
  }
  
  try {
    const parsed = JSON.parse(token);
    return {
      key: tokenKey,
      hasToken: !!parsed?.access_token,
      expiresAt: parsed?.expires_at
    };
  } catch {
    return { key: tokenKey, hasToken: false };
  }
}
