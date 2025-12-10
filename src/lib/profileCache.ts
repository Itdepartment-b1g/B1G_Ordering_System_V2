// ============================================================================
// PROFILE CACHE UTILITY
// ============================================================================
// Secure caching for user profile data with TTL and validation
// ============================================================================

import type { User } from '@/features/auth/types';

const CACHE_KEY = 'user_profile_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedProfile {
  data: User;
  timestamp: number;
  version: string; // Track cache schema version
}

/**
 * Get cached profile if valid
 */
export function getCachedProfile(): User | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const profile: CachedProfile = JSON.parse(cached);
    
    // Validate cache structure
    if (!profile.data || !profile.timestamp || !profile.version) {
      console.warn('🗑️ [ProfileCache] Invalid cache structure, clearing');
      clearProfileCache();
      return null;
    }

    // Check if cache is expired
    const age = Date.now() - profile.timestamp;
    if (age > CACHE_TTL) {
      console.log('⏰ [ProfileCache] Cache expired, clearing');
      clearProfileCache();
      return null;
    }

    // Validate required fields
    if (!profile.data.id || !profile.data.email || !profile.data.role) {
      console.warn('🗑️ [ProfileCache] Missing required fields, clearing');
      clearProfileCache();
      return null;
    }

    console.log(`✅ [ProfileCache] Cache hit (age: ${Math.round(age / 1000)}s)`);
    return profile.data;
  } catch (error) {
    console.error('❌ [ProfileCache] Error reading cache:', error);
    clearProfileCache();
    return null;
  }
}

/**
 * Save profile to cache
 */
export function setCachedProfile(user: User): void {
  try {
    // Validate required fields before caching
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
    // If localStorage is full, clear old cache
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('🗑️ [ProfileCache] Storage quota exceeded, clearing cache');
      clearProfileCache();
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

/**
 * Check if cache is valid (not expired)
 */
export function isCacheValid(): boolean {
  const age = getCacheAge();
  return age !== null && age * 1000 < CACHE_TTL;
}

