/**
 * Input Validation Utilities
 *
 * Validation functions to prevent oversized inputs and ensure data integrity.
 */

// Maximum lengths for various inputs
export const MAX_MESSAGE_LENGTH = 10000; // 10KB max for chat messages
export const MAX_TASK_LENGTH = 500; // Task descriptions
export const MAX_MEMORY_CONTENT_LENGTH = 5000; // Memory item content

/**
 * Validate message length
 */
export function validateMessageLength(message: string): { valid: boolean; error?: string } {
  if (!message || typeof message !== "string") {
    return { valid: false, error: "Message must be a non-empty string" };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
    };
  }
  return { valid: true };
}

/**
 * Validate task length
 */
export function validateTaskLength(task: string | undefined): { valid: boolean; error?: string } {
  if (task === undefined || task === null) {
    return { valid: true }; // Task is optional
  }
  if (typeof task !== "string") {
    return { valid: false, error: "Task must be a string" };
  }
  if (task.length > MAX_TASK_LENGTH) {
    return {
      valid: false,
      error: `Task description too long (max ${MAX_TASK_LENGTH} characters)`,
    };
  }
  return { valid: true };
}

/**
 * Validate memory content length
 */
export function validateMemoryContent(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== "string") {
    return { valid: false, error: "Content must be a non-empty string" };
  }
  if (content.length > MAX_MEMORY_CONTENT_LENGTH) {
    return {
      valid: false,
      error: `Content too long (max ${MAX_MEMORY_CONTENT_LENGTH} characters)`,
    };
  }
  return { valid: true };
}
