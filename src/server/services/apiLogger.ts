/**
 * API Call Logger
 *
 * Captures and stores raw Anthropic API calls for debugging purposes.
 * Only stores in-memory for dev mode - not persisted to database.
 */

export interface ApiCallLog {
  id: string;
  timestamp: string;
  type: "messages.create" | "messages.stream";
  request: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  };
  response?: {
    id?: string;
    model?: string;
    content?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    stop_reason?: string;
  };
  durationMs?: number;
  error?: string;
}

// In-memory store for API call logs (circular buffer)
const MAX_LOGS = 50;
const apiCallLogs: ApiCallLog[] = [];

let logIdCounter = 0;

/**
 * Create a new API call log entry (before making the call)
 */
export function startApiCallLog(
  type: ApiCallLog["type"],
  request: ApiCallLog["request"]
): string {
  const id = `call-${++logIdCounter}-${Date.now()}`;

  const log: ApiCallLog = {
    id,
    timestamp: new Date().toISOString(),
    type,
    request: {
      ...request,
      // Truncate system prompt for display if very long
      system:
        request.system.length > 10000
          ? request.system.substring(0, 10000) + "\n\n... [truncated]"
          : request.system,
    },
  };

  // Add to beginning of array (most recent first)
  apiCallLogs.unshift(log);

  // Keep only the last MAX_LOGS entries
  if (apiCallLogs.length > MAX_LOGS) {
    apiCallLogs.pop();
  }

  return id;
}

/**
 * Complete an API call log entry (after receiving response)
 */
export function completeApiCallLog(
  id: string,
  response: ApiCallLog["response"],
  durationMs: number
): void {
  const log = apiCallLogs.find((l) => l.id === id);
  if (log) {
    log.response = response;
    log.durationMs = durationMs;
  }
}

/**
 * Mark an API call as failed
 */
export function failApiCallLog(id: string, error: string, durationMs: number): void {
  const log = apiCallLogs.find((l) => l.id === id);
  if (log) {
    log.error = error;
    log.durationMs = durationMs;
  }
}

/**
 * Get all stored API call logs
 */
export function getApiCallLogs(): ApiCallLog[] {
  return [...apiCallLogs];
}

/**
 * Get a single API call log by ID
 */
export function getApiCallLog(id: string): ApiCallLog | undefined {
  return apiCallLogs.find((l) => l.id === id);
}

/**
 * Clear all stored logs
 */
export function clearApiCallLogs(): void {
  apiCallLogs.length = 0;
}

/**
 * Get summary statistics
 */
export function getApiCallStats(): {
  total: number;
  successful: number;
  failed: number;
  averageDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
} {
  const successful = apiCallLogs.filter((l) => l.response && !l.error);
  const failed = apiCallLogs.filter((l) => l.error);

  const durations = apiCallLogs.filter((l) => l.durationMs).map((l) => l.durationMs!);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const totalInputTokens = successful.reduce(
    (sum, l) => sum + (l.response?.usage?.input_tokens || 0),
    0
  );
  const totalOutputTokens = successful.reduce(
    (sum, l) => sum + (l.response?.usage?.output_tokens || 0),
    0
  );

  return {
    total: apiCallLogs.length,
    successful: successful.length,
    failed: failed.length,
    averageDurationMs: Math.round(avgDuration),
    totalInputTokens,
    totalOutputTokens,
  };
}
