// ============================================================================
// PROFILE CACHE UTILITY
// ============================================================================
// Secure caching for user profile data with persistent session storage
// and stale-while-revalidate strategy.
// ============================================================================

import type { User } from '@/features/auth/types';

const CACHE_KEY = 'user_profile_v1';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes (User requested increase)

interface CachedProfile {
  data: User;
  timestamp: number;
  version: string;
}

/**
 * Get cached profile even if stale (unless corrupted)
 * Persists across page refreshes and tab closures via localStorage
 */
export function getCachedProfile(): User | null {
  try {
    // Use localStorage so session persists even after closing the tab
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const profile: CachedProfile = JSON.parse(cached);

    // Validate cache structure
    if (!profile.data || !profile.timestamp || !profile.version) {
      console.warn('🗑️ [ProfileCache] Invalid cache structure, clearing');
      clearProfileCache();
      return null;
    }

    // Validate required fields
    if (!profile.data.id || !profile.data.email || !profile.data.role) {
      console.warn('🗑️ [ProfileCache] Missing required fields, clearing');
      clearProfileCache();
      return null;
    }

    // Return data even if expired (caller will check staleness)
    return profile.data;
  } catch (error) {
    console.error('❌ [ProfileCache] Error reading cache:', error);
    clearProfileCache();
    return null;
  }
}

/**
 * Check if the current cache is stale (older than TTL)
 */
export function isCacheStale(): boolean {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return true; // No cache = stale

    const profile: CachedProfile = JSON.parse(cached);
    const age = Date.now() - profile.timestamp;

    const isStale = age > CACHE_TTL;
    if (isStale) {
      console.log(`⏰ [ProfileCache] Cache is stale (age: ${Math.round(age / 1000)}s)`);
    }
    return isStale;
  } catch {
    return true;
  }
}

/**
 * Save profile to cache
 */
export function setCachedProfile(user: User): void {
  try {
    if (!user.id || !user.email || !user.role) {
      console.warn('⚠️ [ProfileCache] Cannot cache incomplete profile');
      return;
    }

    const profile: CachedProfile = {
      data: user,
      timestamp: Date.now(),
      version: '1.0'
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    console.log('💾 [ProfileCache] Profile cached successfully');
  } catch (error) {
    console.error('❌ [ProfileCache] Error saving cache:', error);
    // If quota exceeded, try to clear and retry once
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        localStorage.clear();
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: user,
          timestamp: Date.now(),
          version: '1.0'
        }));
      } catch (e) {
        console.warn('🗑️ [ProfileCache] Storage quota exceeded');
      }
    }
  }
}

/**
 * Clear profile cache
 */
export function clearProfileCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️ [ProfileCache] Cache cleared');
  } catch (error) {
    console.error('❌ [ProfileCache] Error clearing cache:', error);
  }
}

/**
 * Get cache age in seconds
 */
export function getCacheAge(): number | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const profile: CachedProfile = JSON.parse(cached);
    return Math.round((Date.now() - profile.timestamp) / 1000);
  } catch {
    return null;
  }
}
