/**
 * Matebil Guitar Tuner
 * Copyright (c) 2025 Matebil Limited
 * Licensed under MIT License
 * https://github.com/matebil/guitar-tuner
 */

/**
 * Simple logger that respects development/production environment
 * In production, console.log is disabled but errors are still logged
 */

// Check if we're in development mode
const isDev = __DEV__;

export const logger = {
  /**
   * Log debug information (disabled in production)
   */
  log: (...args) => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Log errors (always enabled, even in production)
   */
  error: (...args) => {
    console.error(...args);
  },

  /**
   * Log warnings (always enabled, even in production)
   */
  warn: (...args) => {
    console.warn(...args);
  },

  /**
   * Log info (disabled in production)
   */
  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },
};
