/**
 * JSON utility functions
 *
 * Safe JSON parsing with fallbacks to prevent crashes from corrupted data.
 */

/**
 * Safely parse JSON with a fallback value
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parse user preferences with default empty object fallback
 */
export function parsePreferences(json: string): Record<string, unknown> {
  return safeJsonParse(json, {});
}

/**
 * Parse user interests with default empty array fallback
 */
export function parseInterests(json: string | null): string[] {
  return safeJsonParse(json, []);
}
