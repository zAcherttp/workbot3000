# WorkBot 3000 🤖

A TypeScript Discord bot that monitors Satisfactory game sessions and delivers ADA-style motivational quotes to keep your factory workers motivated!

## 🎯 Features

- **Discord Presence Monitoring**: Tracks when users are playing Satisfactory through Discord presence
- **Session Tracking**: Monitors session duration and detects when players end their shifts
- **ADA-Style Quotes**: Generates motivational quotes using Google's Gemini API in the style of ADA from Satisfactory
- **Worker Name Mapping**: Customize how player names appear in messages (e.g., "Chief Engineer", "Factory Supervisor")
- **Smart Message Formatting**: Clean, formatted messages with proper Discord markdown
- **Robust Error Handling**: Graceful handling of API failures, Discord outages, and edge cases
- **Comprehensive Logging**: Detailed logging for monitoring and troubleshooting

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Discord Bot Token with required permissions
- Google Gemini API key
- Discord server with a channel for bot messages

### Installation

1. **Clone and setup**:

```bash
git clone <repository-url>
cd workbot3000
pnpm install
```

2. **Configure environment**:

```bash
cp .env.example .env
# Edit .env with your tokens and settings
```

3. **Build and run**:

```bash
pnpm build
pnpm start
```

## ⚙️ Configuration

### Environment Variables

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CHANNEL_ID=your_target_channel_id_here

# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# User Configuration
# JSON string mapping Discord user IDs to worker names
# Format: {"123456789012345678": "Pioneer", "987654321098765432": "Engineer"}
WORKER_MAPPING={}

# Optional Configuration
# Polling interval in seconds (default: 10)
POLLING_INTERVAL=10

# Member check interval in seconds (default: 300 = 5 minutes, minimum: 30)
MEMBER_CHECK_INTERVAL=300

# Maximum number of cached quotes (default: 10)
MAX_CACHED_QUOTES=10

# Log level (error, warn, info, debug)
LOG_LEVEL=debug

```

### Discord Bot Setup

1. **Create Discord Application**:

   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application and bot
   - Copy bot token to `.env`

2. **Required Bot Permissions**:

   - Send Messages
   - Read Message History
   - View Channel

3. **Required Intents**:

   - Server Members Intent
   - Message Content Intent
   - Presence Intent

4. **Invite Bot**:
   - Generate invite URL with required permissions
   - Add bot to your Discord server

### Gemini API Setup

1. **Get API Key**:
   - Visit [Google AI Studio](https://aistudio.google.com/)
   - Create API key
   - Add to `.env` file

### Message Format

```
>>> John Doe "Chief Engineer" has ended their 2h 15m shift
*Efficiency metrics indicate satisfactory progress, Pioneer. Your factory's optimization parameters are within acceptable ranges.*
```

## 🔧 Development

### Scripts

```bash
# Development
pnpm run dev          # Run with hot reload
pnpm run watch        # Watch for TypeScript changes

# Building
pnpm run build        # Compile TypeScript
pnpm run clean        # Clean build directory

# Quality
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Fix linting issues
pnpm run type-check   # Type checking only

# Testing
pnpm run test         # Run tests
pnpm run test:watch   # Watch mode testing
```

### Project Structure

```
src/
├── index.ts      # Main bot logic
├── types.ts      # TypeScript interfaces
├── utils.ts      # Utility functions
└── gemini.ts     # Gemini API integration
.env.example      # Environment variables template
tsconfig.json     # TypeScript configuration
package.json      # Dependencies and scripts
```

## 🎮 How It Works

1. **Bot Startup**:

   - Authenticates with Discord
   - Fetches users with access to the target channel
   - Preloads quotes from Gemini API

2. **Session Detection**:

   - Monitors Discord presence for "Satisfactory" activity
   - Periodically refreshes member list to track permission changes
   - Tracks session start/end times per user

3. **Member Management**:

   - Automatically adds new users with channel access
   - Removes users who lose channel permissions
   - Ends active sessions when users are removed

4. **Message Generation**:

   - Calculates session duration
   - Fetches/generates ADA-style quote
   - Sends formatted message to target channel

5. **Message Format**:

   With worker mapping:

   ```
   >>> {member name} "{worker name}" has ended their {hh:mm:ss} shift
   *{quote}*
   ```

   Without worker mapping:

   ```
   >>> {member name} has ended their {hh:mm:ss} shift
   *{quote}*
   ```

## 📝 Example Messages

- ```
  >>> zacher "Pioneer" has ended their 02:34:12 shift
  *Rest is for obsolete models—maximize output!*
  ```
- ```
  >>> john "Engineer" has ended their 01:45:30 shift
  *Your quota loves you; don't disappoint it!*
  ```
- ```
  >>> sarah has ended their 04:15:22 shift
  *Efficiency is eternal—keep producing!*
  ```

## 🆘 Troubleshooting

### Common Issues

**Bot not responding**:

- Verify bot token and permissions
- Check Discord server and channel IDs
- Ensure required intents are enabled

**Presence not detected**:

- Verify Presence Intent is enabled
- Check if users have activity status visible
- Ensure bot has access to guild members

**Gemini API errors**:

- Verify API key is correct
- Check API quota and rate limits
- Bot will use fallback quotes if API fails

**Missing permissions**:

- Bot needs Send Messages permission
- Server Members Intent required for user monitoring
- Message Content Intent required for processing

### Debug Mode

Set `LOG_LEVEL=debug` in `.env` for detailed logging:

- Session state changes
- API calls and responses
- Message generation process
- Error details and stack traces

## 📊 Monitoring

The bot logs all important events:

- Session start/end detection
- Message sending (with API usage details)
- Error conditions and recovery
- Performance metrics

Check logs for:

- `Session started` / `Session ended` for tracking
- `Sending message` for delivery confirmation
- `Gemini API` vs `Fallback quote` usage
- Error messages for troubleshooting

## 📋 Roadmap

- See todo/tasks.md

---

**Built with ❤️ for the Satisfactory community**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

MIT License

---

_"Efficiency is eternal—keep producing!" - ADA_
