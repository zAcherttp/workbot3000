import * as ps from "ps-node";
import {
  LogLevel,
  LogEntry,
  RetryConfig,
  ProcessCheckResult,
  WorkerConfig,
  BotConfig,
} from "./types.js";

// Type definitions for ps-node since @types/ps-node doesn't exist
interface PsProcess {
  pid: number;
  command: string;
  arguments: string[];
}

//type PsCallback = (err: Error | null, resultList: PsProcess[]) => void;

/**
 * Format duration from milliseconds to hh:mm:ss
 * @param milliseconds - Duration in milliseconds
 * @returns Formatted duration string (e.g., "03:12:45")
 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Check if Satisfactory process is running using ps-node
 * @returns Promise resolving to process check result
 */
export async function checkSatisfactoryProcess(): Promise<ProcessCheckResult> {
  const timestamp = Date.now();

  return new Promise((resolve) => {
    ps.lookup(
      {
        command: "Satisfactory",
        psargs: "aux",
      },
      (err: Error | null, resultList: PsProcess[]) => {
        if (err) {
          resolve({
            isRunning: false,
            error: err.message,
            timestamp,
          });
          return;
        }

        // Filter for actual Satisfactory executable
        const satisfactoryProcesses = resultList.filter(
          (process: PsProcess) =>
            process.command &&
            (process.command.includes("Satisfactory.exe") ||
              process.command.includes("FactoryGame.exe") ||
              process.command.toLowerCase().includes("satisfactory"))
        );

        if (satisfactoryProcesses.length > 0) {
          resolve({
            isRunning: true,
            pid: satisfactoryProcesses[0]?.pid || 0,
            timestamp,
          });
        } else {
          resolve({
            isRunning: false,
            timestamp,
          });
        }
      }
    );
  });
}

/**
 * Parse worker mapping from JSON string
 * @param mappingString - JSON string containing Discord ID to worker name mapping
 * @param defaultName - Default worker name if mapping fails
 * @returns Parsed worker configuration
 */
export function parseWorkerMapping(
  mappingString: string,
  defaultName: string = "Pioneer"
): WorkerConfig {
  try {
    const mapping = JSON.parse(mappingString);

    // Validate that mapping is an object with string keys and values
    if (typeof mapping !== "object" || mapping === null) {
      throw new Error("Worker mapping must be an object");
    }

    for (const [key, value] of Object.entries(mapping)) {
      if (typeof key !== "string" || typeof value !== "string") {
        throw new Error("Worker mapping keys and values must be strings");
      }
    }

    return {
      mapping: mapping as Record<string, string>,
      defaultName,
    };
  } catch (error) {
    console.warn(
      `[${new Date().toISOString()}] [WARN] Failed to parse worker mapping: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return {
      mapping: {},
      defaultName,
    };
  }
}

/**
 * Sanitize Discord message content to prevent injection attacks
 * @param content - Raw message content
 * @returns Sanitized message content
 */
export function sanitizeDiscordMessage(content: string): string {
  // Escape Discord markdown characters
  const discordMarkdown = /([*_`~|\\])/g;

  // Replace potentially harmful characters
  return content
    .replace(discordMarkdown, "\\$1")
    .replace(/@(everyone|here)/g, "@​$1") // Zero-width space to prevent pings
    .replace(/<@[!&]?(\d+)>/g, "@​user") // Remove user mentions
    .replace(/<#(\d+)>/g, "#​channel") // Remove channel mentions
    .replace(/<:[a-zA-Z0-9_]+:(\d+)>/g, ":emoji:") // Remove custom emojis
    .trim();
}

/**
 * Create a structured logger with timestamp formatting
 * @param level - Log level filter
 * @returns Logger function
 */
export function createLogger(
  level: LogLevel = "info"
): (entry: Omit<LogEntry, "timestamp" | "formattedTime">) => void {
  const levelPriority: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  const currentPriority = levelPriority[level];

  return (entry: Omit<LogEntry, "timestamp" | "formattedTime">) => {
    const entryPriority = levelPriority[entry.level];

    if (entryPriority <= currentPriority) {
      const timestamp = Date.now();
      const formattedTime = new Date(timestamp).toISOString();

      const levelTag = `[${entry.level.toUpperCase()}]`;
      const contextString = entry.context
        ? ` ${JSON.stringify(entry.context)}`
        : "";

      console.log(
        `[${formattedTime}] ${levelTag} ${entry.message}${contextString}`
      );
    }
  };
}

/**
 * Retry utility for API calls with exponential backoff
 * @param fn - Function to retry
 * @param config - Retry configuration
 * @returns Promise resolving to function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  }
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === config.maxAttempts) {
        throw lastError;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate and parse environment variables into bot configuration
 * @returns Parsed bot configuration
 */
export function parseBotConfig(): BotConfig {
  const requiredEnvVars = [
    "DISCORD_TOKEN",
    "CHANNEL_ID",
    "GEMINI_API_KEY",
    "LOCAL_USER_ID",
  ];

  // Check for required environment variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  // Parse worker mapping
  const workerMappingString = process.env["WORKER_MAPPING"] || "{}";
  const workerMapping = parseWorkerMapping(workerMappingString);

  // Validate numeric values
  const pollingInterval = parseInt(process.env["POLLING_INTERVAL"] || "10");
  if (isNaN(pollingInterval) || pollingInterval < 1) {
    throw new Error("POLLING_INTERVAL must be a positive number");
  }

  const maxCachedQuotes = parseInt(process.env["MAX_CACHED_QUOTES"] || "10");
  if (isNaN(maxCachedQuotes) || maxCachedQuotes < 1) {
    throw new Error("MAX_CACHED_QUOTES must be a positive number");
  }

  // Validate log level
  const logLevel = (process.env["LOG_LEVEL"] || "info") as LogLevel;
  if (!["error", "warn", "info", "debug"].includes(logLevel)) {
    throw new Error("LOG_LEVEL must be one of: error, warn, info, debug");
  }

  return {
    discordToken: process.env["DISCORD_TOKEN"]!,
    channelId: process.env["CHANNEL_ID"]!,
    geminiApiKey: process.env["GEMINI_API_KEY"]!,
    geminiModel: process.env["GEMINI_MODEL"] || "gemini-2.5-flash",
    workerMapping,
    localUserId: process.env["LOCAL_USER_ID"]!,
    pollingInterval,
    maxCachedQuotes,
    logLevel,
  };
}

/**
 * Get worker name for a Discord user ID
 * @param userId - Discord user ID
 * @param workerConfig - Worker configuration
 * @param fallbackName - Fallback name if not found in mapping
 * @returns Worker name
 */
export function getWorkerName(
  userId: string,
  workerConfig: WorkerConfig,
  fallbackName?: string
): string {
  return (
    workerConfig.mapping[userId] || fallbackName || workerConfig.defaultName
  );
}

/**
 * Calculate memory usage in MB
 * @returns Memory usage in megabytes
 */
export function getMemoryUsage(): number {
  const usage = process.memoryUsage();
  return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

/**
 * Validate Discord user ID format
 * @param userId - Discord user ID to validate
 * @returns Whether the user ID is valid
 */
export function isValidDiscordUserId(userId: string): boolean {
  // Discord user IDs are 17-19 digit numbers
  return /^\d{17,19}$/.test(userId);
}

/**
 * Validate Discord channel ID format
 * @param channelId - Discord channel ID to validate
 * @returns Whether the channel ID is valid
 */
export function isValidDiscordChannelId(channelId: string): boolean {
  // Discord channel IDs are 17-19 digit numbers
  return /^\d{17,19}$/.test(channelId);
}

/**
 * Safe JSON parse with error handling
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}
