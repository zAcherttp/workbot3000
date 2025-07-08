import {
  Client,
  GatewayIntentBits,
  TextChannel,
  GuildMember,
  ActivityType,
} from "discord.js";
import { config } from "dotenv";
import {
  SessionState,
  DiscordUser,
  BotConfig,
  GameActivity,
  PerformanceMetrics,
} from "./types";
import {
  parseBotConfig,
  formatDuration,
  getWorkerName,
  sanitizeDiscordMessage,
  createLogger,
  getMemoryUsage,
} from "./utils";
import { createGeminiClient, GeminiClient } from "./gemini";

// Load environment variables
config();

/**
 * WorkBot 3000 - Discord bot for monitoring Satisfactory game sessions
 */
class WorkBot3000 {
  private client: Client;
  private config: BotConfig;
  private geminiClient: GeminiClient;
  private sessionStates: Map<string, SessionState> = new Map();
  private monitoredUsers: Map<string, DiscordUser> = new Map();
  private targetChannel: TextChannel | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private memberCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private logger: (entry: {
    level: "error" | "warn" | "info" | "debug";
    message: string;
    context?: Record<string, unknown>;
  }) => void;

  constructor() {
    // Parse configuration
    this.config = parseBotConfig();
    this.logger = createLogger(this.config.logLevel);

    // Initialize Discord client
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
      ],
    });

    // Initialize Gemini client
    this.geminiClient = createGeminiClient(
      this.config.geminiApiKey,
      this.config.geminiModel,
      this.config.maxCachedQuotes
    );

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    try {
      this.logger({
        level: "info",
        message: "Starting WorkBot 3000...",
      });

      await this.client.login(this.config.discordToken);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide specific guidance for common errors
      if (errorMessage.includes("Used disallowed intents")) {
        this.logger({
          level: "error",
          message: "Bot failed to start due to missing privileged intents",
          context: {
            error: errorMessage,
            solution:
              "Enable 'Server Members Intent' and 'Presence Intent' in Discord Developer Portal under Bot → Privileged Gateway Intents",
          },
        });
      } else {
        this.logger({
          level: "error",
          message: "Failed to start bot",
          context: {
            error: errorMessage,
          },
        });
      }
      process.exit(1);
    }
  }

  /**
   * Stop the bot gracefully
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    this.logger({
      level: "info",
      message: "Shutting down WorkBot 3000...",
    });

    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Clear member check interval
    if (this.memberCheckInterval) {
      clearInterval(this.memberCheckInterval);
    }

    // Send final messages for active sessions
    await this.handleShutdownSessions();

    // Destroy Discord client
    this.client.destroy();

    this.logger({
      level: "info",
      message: "WorkBot 3000 shutdown complete",
    });
  }

  /**
   * Set up Discord event listeners
   */
  private setupEventListeners(): void {
    this.client.on("ready", () => this.onReady());
    this.client.on("error", (error) => this.onError(error));
    this.client.on("warn", (warning) => this.onWarning(warning));
    this.client.on("disconnect", () => this.onDisconnect());
    this.client.on("presenceUpdate", (oldPresence, newPresence) =>
      this.onPresenceUpdate(oldPresence, newPresence)
    );
  }

  /**
   * Handle bot ready event
   */
  private async onReady(): Promise<void> {
    if (!this.client.user) {
      throw new Error("Client user is null");
    }

    this.logger({
      level: "info",
      message: `WorkBot 3000 online as ${this.client.user.tag}`,
      context: { userId: this.client.user.id },
    });

    try {
      // Find target channel
      await this.findTargetChannel();

      // Fetch monitored users
      await this.fetchMonitoredUsers();

      // Preload quotes
      await this.geminiClient.preloadQuotes(5);

      // Start monitoring
      this.startMonitoring();

      // Start member checking
      this.startMemberChecking();

      this.logger({
        level: "info",
        message: "Bot initialization complete",
        context: {
          monitoredUsers: this.monitoredUsers.size,
          targetChannel: this.targetChannel?.name,
        },
      });
    } catch (error) {
      this.logger({
        level: "error",
        message: "Failed to initialize bot",
        context: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Handle Discord client errors
   */
  private onError(error: Error): void {
    this.logger({
      level: "error",
      message: "Discord client error",
      context: { error: error.message },
    });
  }

  /**
   * Handle Discord client warnings
   */
  private onWarning(warning: string): void {
    this.logger({
      level: "warn",
      message: "Discord client warning",
      context: { warning },
    });
  }

  /**
   * Handle Discord client disconnect
   */
  private onDisconnect(): void {
    this.logger({
      level: "warn",
      message: "Disconnected from Discord",
    });
  }

  /**
   * Handle presence update events
   */
  private async onPresenceUpdate(
    _oldPresence: unknown,
    newPresence: unknown
  ): Promise<void> {
    if (
      !newPresence ||
      typeof newPresence !== "object" ||
      !("user" in newPresence)
    )
      return;

    const userId = (newPresence as any).user?.id;
    if (!userId) return;

    // Only process monitored users
    if (!this.monitoredUsers.has(userId)) return;

    const isPlayingSatisfactory =
      this.isPlayingSatisfactoryFromPresence(newPresence);

    this.logger({
      level: "debug",
      message: "Presence update",
      context: {
        userId,
        isPlayingSatisfactory,
        activities:
          (newPresence as any).activities?.map((a: GameActivity) => a.name) ||
          [],
      },
    });

    await this.updateSessionState(userId, isPlayingSatisfactory);
  }

  /**
   * Find the target channel for sending messages
   */
  private async findTargetChannel(): Promise<void> {
    const channel = await this.client.channels.fetch(this.config.channelId);

    if (!channel) {
      throw new Error(`Channel with ID ${this.config.channelId} not found`);
    }

    if (!channel.isTextBased()) {
      throw new Error(`Channel ${this.config.channelId} is not a text channel`);
    }

    this.targetChannel = channel as TextChannel;

    this.logger({
      level: "info",
      message: "Target channel found",
      context: {
        channelName: this.targetChannel.name,
        channelId: this.config.channelId,
      },
    });
  }

  /**
   * Fetch users who have access to the target channel
   */
  private async fetchMonitoredUsers(): Promise<void> {
    // Use the same logic as updateMonitoredUsers for initial load
    await this.updateMonitoredUsers();
  }

  /**
   * Start the member checking interval
   */
  private startMemberChecking(): void {
    this.memberCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      await this.updateMonitoredUsers();
    }, this.config.memberCheckInterval * 1000);

    this.logger({
      level: "info",
      message: "Member checking started",
      context: { intervalSeconds: this.config.memberCheckInterval },
    });
  }

  /**
   * Update monitored users list (periodic refresh)
   */
  private async updateMonitoredUsers(): Promise<void> {
    if (!this.targetChannel) return;

    try {
      const guild = this.targetChannel.guild;

      this.logger({
        level: "debug",
        message: "Fetching guild members",
        context: { guildId: guild.id, guildName: guild.name },
      });

      // Fetch all members with timeout
      try {
        await guild.members.fetch({ time: 30000 }); // 30 second timeout
      } catch (fetchError) {
        this.logger({
          level: "error",
          message: "Failed to fetch guild members - check bot permissions",
          context: {
            error:
              fetchError instanceof Error
                ? fetchError.message
                : String(fetchError),
            guildId: guild.id,
            hasGuildMembersIntent:
              "Ensure 'Server Members Intent' is enabled in Discord Developer Portal",
          },
        });
        return;
      }

      const currentUserIds = new Set(this.monitoredUsers.keys());
      const newUserIds = new Set<string>();

      // Check each member's permissions
      for (const [userId, member] of guild.members.cache) {
        if (member.user.bot) continue; // Skip bots

        const hasAccess = this.userHasChannelAccess(member, this.targetChannel);

        if (hasAccess) {
          newUserIds.add(userId);

          // Add new user or update existing
          if (!this.monitoredUsers.has(userId)) {
            this.monitoredUsers.set(userId, {
              user: member.user,
              member,
              hasChannelAccess: true,
              lastPresence: member.presence?.status || null,
            });

            // Initialize session state for new user
            this.sessionStates.set(userId, {
              startTime: null,
              isPlaying: false,
              lastPresenceCheck: Date.now(),
            });

            this.logger({
              level: "info",
              message: "New user added to monitoring",
              context: { userId, username: member.user.username },
            });
          } else {
            // Update existing user info
            const existingUser = this.monitoredUsers.get(userId)!;
            existingUser.member = member;
            existingUser.hasChannelAccess = true;
            existingUser.lastPresence = member.presence?.status || null;
          }
        }
      }

      // Remove users who no longer have access
      for (const userId of currentUserIds) {
        if (!newUserIds.has(userId)) {
          // End any active session before removing
          const sessionState = this.sessionStates.get(userId);
          if (sessionState?.isPlaying && sessionState.startTime) {
            const duration = Date.now() - sessionState.startTime;
            await this.sendSessionEndMessage(userId, duration);
          }

          this.monitoredUsers.delete(userId);
          this.sessionStates.delete(userId);

          this.logger({
            level: "info",
            message: "User removed from monitoring",
            context: { userId },
          });
        }
      }

      const addedUsers = newUserIds.size - currentUserIds.size;
      const removedUsers = currentUserIds.size - newUserIds.size;

      if (addedUsers > 0 || removedUsers > 0) {
        this.logger({
          level: "info",
          message: "Monitored users updated",
          context: {
            totalUsers: this.monitoredUsers.size,
            addedUsers,
            removedUsers,
          },
        });
      }
    } catch (error) {
      this.logger({
        level: "error",
        message: "Failed to update monitored users",
        context: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Check if a user has access to the target channel
   */
  private userHasChannelAccess(
    member: GuildMember,
    channel: TextChannel
  ): boolean {
    try {
      const permissions = channel.permissionsFor(member);
      return permissions ? permissions.has("ViewChannel") : false;
    } catch (error) {
      this.logger({
        level: "warn",
        message: "Failed to check user permissions",
        context: {
          userId: member.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return false;
    }
  }

  /**
   * Check if user is playing Satisfactory from presence data
   */
  private isPlayingSatisfactoryFromPresence(presence: unknown): boolean {
    if (
      !presence ||
      typeof presence !== "object" ||
      !("activities" in presence)
    ) {
      return false;
    }

    const activities = (presence as any).activities;
    if (!Array.isArray(activities)) {
      return false;
    }

    return activities.some(
      (activity: GameActivity) =>
        activity.type === ActivityType.Playing &&
        activity.name === "Satisfactory"
    );
  }

  /**
   * Start the monitoring loop (presence-only)
   */
  private startMonitoring(): void {
    this.pollingInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      await this.performMonitoringCycle();
    }, this.config.pollingInterval * 1000);

    this.logger({
      level: "info",
      message: "Presence monitoring started",
      context: { intervalSeconds: this.config.pollingInterval },
    });
  }

  /**
   * Perform one monitoring cycle (presence-only)
   */
  private async performMonitoringCycle(): Promise<void> {
    try {
      // Check presence for all monitored users
      for (const [userId, discordUser] of this.monitoredUsers) {
        if (discordUser.member?.presence) {
          const isPlaying = this.isPlayingSatisfactoryFromPresence(
            discordUser.member.presence
          );
          await this.updateSessionState(userId, isPlaying);
        }
      }

      // Log performance metrics periodically
      if (Date.now() % 60000 < this.config.pollingInterval * 1000) {
        // Every minute
        this.logPerformanceMetrics();
      }
    } catch (error) {
      this.logger({
        level: "error",
        message: "Error in monitoring cycle",
        context: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Update session state for a user (presence-only)
   */
  private async updateSessionState(
    userId: string,
    isPlaying: boolean
  ): Promise<void> {
    const currentState = this.sessionStates.get(userId);
    if (!currentState) return;

    const now = Date.now();

    // Update check timestamp
    currentState.lastPresenceCheck = now;

    // Handle session start
    if (isPlaying && !currentState.isPlaying) {
      currentState.isPlaying = true;
      currentState.startTime = now;

      this.logger({
        level: "info",
        message: "Session started",
        context: { userId, source: "presence" },
      });
    }

    // Handle session end
    if (!isPlaying && currentState.isPlaying && currentState.startTime) {
      const duration = now - currentState.startTime;

      // Reset state first
      currentState.isPlaying = false;
      currentState.startTime = null;

      // Send session end message
      await this.sendSessionEndMessage(userId, duration);

      this.logger({
        level: "info",
        message: "Session ended",
        context: {
          userId,
          duration,
          formattedDuration: formatDuration(duration),
        },
      });
    }
  }

  /**
   * Send session end message to the target channel
   */
  private async sendSessionEndMessage(
    userId: string,
    duration: number
  ): Promise<void> {
    if (!this.targetChannel) return;

    try {
      const discordUser = this.monitoredUsers.get(userId);
      const memberName = discordUser?.user.username || "Unknown User";
      const workerName = getWorkerName(userId, this.config.workerMapping);
      const formattedDuration = formatDuration(duration);

      // Attempt to get quote and log the result
      this.logger({
        level: "debug",
        message: "Attempting to fetch quote for session end message",
        context: { userId, memberName },
      });

      const quote = await this.geminiClient.getQuote();

      this.logger({
        level: "debug",
        message: `Quote retrieval ${
          quote.isFallback ? "failed - using fallback" : "successful"
        }`,
        context: {
          userId,
          quoteSource: quote.isFallback ? "fallback/cache" : "gemini-api",
          quoteLength: quote.text.length,
        },
      });

      // Check if worker mapping is available (not using default name)
      const hasCustomWorkerName =
        this.config.workerMapping.mapping[userId] !== undefined;

      let message: string;
      if (hasCustomWorkerName) {
        // Format: >>> {member name} "{worker name}" has ended their {duration} shift
        // {italic quote}
        message = `>>> ${memberName} "${workerName}" has ended their ${formattedDuration} shift!\n*${quote.text}*`;
      } else {
        // Format: >>> {member name} has ended their {duration} shift
        // {italic quote}
        message = `>>> ${memberName} has ended their ${formattedDuration} shift!\n*${quote.text}*`;
      }

      const sanitizedMessage = sanitizeDiscordMessage(message);
      await this.targetChannel.send(sanitizedMessage);

      // Log with explicit API usage information
      const apiUsageMessage = quote.isFallback
        ? "used fallback/cached quote (Gemini API unavailable)"
        : "successfully used Gemini API for fresh quote";

      this.logger({
        level: "info",
        message: `Session end message sent - ${apiUsageMessage}`,
        context: {
          userId,
          memberName,
          workerName,
          duration: formattedDuration,
          hasCustomWorkerName,
          quoteSource: quote.isFallback ? "fallback/cache" : "gemini-api",
          quoteTimestamp: quote.timestamp,
          isFallbackQuote: quote.isFallback,
        },
      });
    } catch (error) {
      this.logger({
        level: "error",
        message: "Failed to send session end message",
        context: {
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Handle active sessions during shutdown
   */
  private async handleShutdownSessions(): Promise<void> {
    const activeSessions = Array.from(this.sessionStates.entries()).filter(
      ([, state]) => state.isPlaying && state.startTime
    );

    if (activeSessions.length === 0) return;

    this.logger({
      level: "info",
      message: "Handling active sessions during shutdown",
      context: { count: activeSessions.length },
    });

    for (const [userId, state] of activeSessions) {
      if (state.startTime) {
        const duration = Date.now() - state.startTime;
        await this.sendSessionEndMessage(userId, duration);
      }
    }
  }

  /**
   * Log performance metrics
   */
  private logPerformanceMetrics(): void {
    const metrics: PerformanceMetrics = {
      memoryUsage: getMemoryUsage(),
      cpuUsage: 0, // Would need additional library for CPU monitoring
      monitoredUsers: this.monitoredUsers.size,
      activeSessions: Array.from(this.sessionStates.values()).filter(
        (s) => s.isPlaying
      ).length,
      apiResponseTimes: {
        discord: 0, // Would need to track these
        gemini: 0,
      },
      uptime: process.uptime() * 1000,
    };

    this.logger({
      level: "debug",
      message: "Performance metrics",
      context: { ...metrics },
    });
  }
}

// Create and start the bot
const bot = new WorkBot3000();

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  await bot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  await bot.stop();
  process.exit(0);
});

// Handle unhandled errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the bot
bot.start().catch(console.error);
