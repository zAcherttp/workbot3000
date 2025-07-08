import { User, GuildMember, PresenceStatus, ActivityType } from "discord.js";

/**
 * Session state tracking for each monitored user
 */
export interface SessionState {
  /** Timestamp when the session started (null if not currently playing) */
  startTime: number | null;
  /** Whether the user is currently playing Satisfactory */
  isPlaying: boolean;
  /** Last known presence status for debugging */
  lastPresenceCheck: number;
  /** Last known process check result for debugging */
  lastProcessCheck: number;
}

/**
 * Configuration for worker name mapping
 */
export interface WorkerConfig {
  /** Discord user ID to worker name mapping */
  mapping: Record<string, string>;
  /** Default worker name when no mapping is found */
  defaultName: string;
}

/**
 * Gemini API quote response structure
 */
export interface GeminiQuote {
  /** The generated quote text */
  text: string;
  /** Timestamp when the quote was generated */
  timestamp: number;
  /** Whether this is a fallback quote */
  isFallback: boolean;
}

/**
 * Discord user data for monitoring
 */
export interface DiscordUser {
  /** Discord user object */
  user: User;
  /** Guild member object (may be null if user left server) */
  member: GuildMember | null;
  /** Whether this user has permission to view the target channel */
  hasChannelAccess: boolean;
  /** Last known presence status */
  lastPresence: PresenceStatus | null;
}

/**
 * Bot configuration loaded from environment variables
 */
export interface BotConfig {
  /** Discord bot token */
  discordToken: string;
  /** Target channel ID for sending messages */
  channelId: string;
  /** Gemini API key */
  geminiApiKey: string;
  /** Gemini API URL */
  geminiModel: string;
  /** Worker name mapping configuration */
  workerMapping: WorkerConfig;
  /** Local user ID for process monitoring */
  localUserId: string;
  /** Polling interval in seconds */
  pollingInterval: number;
  /** Maximum number of cached quotes */
  maxCachedQuotes: number;
  /** Log level */
  logLevel: LogLevel;
}

/**
 * Process check result from ps-node
 */
export interface ProcessCheckResult {
  /** Whether Satisfactory process is running */
  isRunning: boolean;
  /** Process ID if running */
  pid?: number;
  /** Error message if check failed */
  error?: string;
  /** Timestamp of the check */
  timestamp: number;
}

/**
 * Discord presence activity for game detection
 */
export interface GameActivity {
  /** Activity name (should be "Satisfactory") */
  name: string;
  /** Activity type */
  type: ActivityType;
  /** Activity state (optional) */
  state?: string;
  /** Activity details (optional) */
  details?: string;
}

/**
 * Session end event data
 */
export interface SessionEndEvent {
  /** Discord user ID */
  userId: string;
  /** Worker name */
  workerName: string;
  /** Session duration in milliseconds */
  duration: number;
  /** Formatted duration string (hh:mm:ss) */
  formattedDuration: string;
  /** Generated quote */
  quote: string;
  /** Session start timestamp */
  startTime: number;
  /** Session end timestamp */
  endTime: number;
}

/**
 * Logging levels
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

/**
 * Log entry structure
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
  /** Formatted timestamp string */
  formattedTime: string;
}

/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay between retries in milliseconds */
  baseDelay: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Circuit breaker state for external APIs
 */
export interface CircuitBreakerState {
  /** Whether the circuit breaker is open (failing) */
  isOpen: boolean;
  /** Number of consecutive failures */
  failureCount: number;
  /** Timestamp of last failure */
  lastFailureTime: number;
  /** Timestamp when circuit breaker will attempt to close */
  nextAttemptTime: number;
}

/**
 * Performance metrics for monitoring
 */
export interface PerformanceMetrics {
  /** Memory usage in MB */
  memoryUsage: number;
  /** CPU usage percentage */
  cpuUsage: number;
  /** Number of monitored users */
  monitoredUsers: number;
  /** Number of active sessions */
  activeSessions: number;
  /** API response times */
  apiResponseTimes: {
    discord: number;
    gemini: number;
  };
  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Error context for structured error logging
 */
export interface ErrorContext {
  /** Error type/category */
  type: string;
  /** User ID if error is user-specific */
  userId?: string;
  /** API endpoint if error is API-related */
  endpoint?: string;
  /** Additional context data */
  data?: Record<string, unknown>;
}
