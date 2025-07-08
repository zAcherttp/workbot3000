---
applyTo: "**/*.ts"
---

# WorkBot 3000 Development Guidelines

## Project Overview

WorkBot 3000 is a Discord bot that monitors Satisfactory game sessions for users with access to a specified Discord channel. The bot tracks session durations and sends motivational messages with ADA-style quotes from the Gemini API.

## Technical Stack

- **Runtime**: Node.js v16+
- **Language**: TypeScript (strict mode, ESNext target)
- **Package Manager**: pnpm
- **Main Dependencies**: discord.js v14+, @google/genai, dotenv
- **Architecture**: Cloud-deployable bot with Discord presence monitoring

## Coding Standards

### TypeScript Configuration

- Use strict mode with ESNext target
- Enable all strict type checking options
- Use explicit return types for all functions
- Prefer `const` over `let` where possible
- Use meaningful variable and function names

### Code Organization

```
src/
├── index.ts      # Main bot logic and entry point
├── types.ts      # Custom interfaces and type definitions
├── utils.ts      # Utility functions (time formatting, Discord helpers)
└── gemini.ts     # Gemini API integration
```

### Error Handling

- Use try-catch blocks for all async operations
- Log errors with timestamps but never log sensitive data
- Implement graceful degradation for API failures
- Handle Discord rate limits with exponential backoff
- Continue monitoring even if individual components fail

### Performance Guidelines

- Use single setInterval for all polling operations
- Cache Gemini quotes (up to 10) to reduce API calls
- Optimize Discord presence subscriptions
- Limit polling frequency to 10-second intervals
- Use Map for efficient session state management
- Periodic member list refresh to handle permission changes

### Security Practices

- Never log tokens, API keys, or sensitive data
- Validate all input data and sanitize Discord messages
- Use environment variables for all configuration
- Implement proper permission checks for channel access
- Escape Discord markdown to prevent injection attacks

## Domain Knowledge

### Discord API

- Use discord.js v14+ with required intents: Guilds, GuildMembers, GuildPresences, GuildMessages
- Monitor user presence activities for "Satisfactory" game detection
- Handle permission overwrites and role-based channel visibility
- Implement proper bot permissions: read messages, send messages, embed links

### Satisfactory Game Detection

- Primary: Discord presence API monitoring
- Handle unreliable presence data gracefully
- Periodic member list refresh to track permission changes
- Monitor all users with channel access automatically

### Session Management

- Track state per user: `{ startTime: number | null, isPlaying: boolean, lastPresenceCheck: number }`
- Use Discord user ID as the primary key
- Format duration as hh:mm:ss (e.g., "03:12:45")
- Reset state after sending session end message
- Automatically handle user permission changes

### ADA-Style Quotes

- Generate via Gemini API with specific system prompt
- Emphasize efficiency, productivity, and overwork themes
- Keep quotes short (1-2 sentences) and humorous
- Align with FICSIT's corporate dystopian tone
- Use fallback quotes for API failures

### Message Format

Standard format with worker mapping: `">>> {member name} \"{worker name}\" has ended their {hh:mm:ss} shift\n*{quote}*"`
Standard format without worker mapping: `">>> {member name} has ended their {hh:mm:ss} shift\n*{quote}*"`

Examples:

- `">>> zacher \"Pioneer\" has ended their 03:12:45 shift\n*Efficiency is eternal—keep producing!*"`
- `">>> john has ended their 02:30:15 shift\n*Sleep is for obsolete models—maximize output!*"`

## Environment Variables

Required variables in .env:

- `DISCORD_TOKEN`: Bot authentication token
- `CHANNEL_ID`: Target Discord channel ID
- `GEMINI_API_KEY`: Gemini API authentication key
- `WORKER_MAPPING`: JSON string mapping Discord IDs to worker names
- `MEMBER_CHECK_INTERVAL`: Interval for checking member permissions (optional, default: 300 seconds)

## Best Practices

### Logging

- Include timestamps in all log messages
- Log session start/stop events
- Log errors with context but not sensitive data
- Use consistent log format: `[TIMESTAMP] [LEVEL] message`
- Log API usage status (Gemini API success vs fallback quotes)
- Include quote source information for debugging

### State Management

- Use in-memory Map for session states
- Implement proper state transitions
- Handle edge cases (bot restart, network issues)
- Consider persistence for critical data

### API Integration

- Implement retry logic for all external API calls
- Use appropriate timeouts for HTTP requests
- Handle rate limiting gracefully
- Cache responses where appropriate

### Testing Considerations

- Structure code for easy unit testing
- Export utility functions for reuse
- Implement proper error boundaries
- Use dependency injection where possible

## Architecture Patterns

### Single Responsibility

- Each module has a clear, single purpose
- Separate Discord logic from game detection
- Isolate API integrations in dedicated modules
- Keep utility functions pure and stateless

### Error Boundaries

- Wrap all async operations in try-catch
- Implement circuit breakers for external APIs
- Use fallback mechanisms for critical functionality
- Never crash the entire bot for single user errors

### Extensibility

- Design for future feature additions
- Use configuration-driven behavior
- Implement plugin-like architecture where possible
- Document all extension points

## Performance Targets

- Memory usage: < 100MB under normal operation
- API response time: < 2 seconds for all operations
- Session detection accuracy: > 95% with presence monitoring
- Uptime: > 99.9% with proper error handling
- Member list refresh efficiency: < 1 second per 100 users

## Deployment Considerations

- Can be deployed locally or in the cloud
- Single bot instance per Discord server
- Handle network interruptions gracefully
- Support for multiple Discord servers (future)
- Automatic member permission tracking
