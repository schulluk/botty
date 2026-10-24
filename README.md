# WhatsApp Bot with Voice Transcription & Birthday Wishes

A feature-rich WhatsApp bot that automatically transcribes voice messages using GPT-4o-transcribe and sends personalized AI-generated birthday wishes. Built with a plugin architecture and runs in Docker.

## Features

### 🎤 Voice Transcription
- **Automatic transcription** of received and sent voice messages
- **GPT-4o-transcribe** for high accuracy (better than Whisper)
- **Pluggable AI provider** - use OpenAI (default) or route through **OpenRouter** (`AI_PROVIDER=openrouter`) for a wide range of models
- **Native OGG/Opus support** (no conversion needed)
- **Race condition handling** - multiple transcriptions processed correctly
- **Per-chat controls** - enable/disable globally or per chat
- **Manual transcription** with `!t` command

### 🎂 Birthday Wishes
- **AI-generated messages** using GPT-4o with high creativity (temperature 1.3)
- **Maximum variety** - every message is unique and creative
- **Age-aware** with correct ordinals (21st, 22nd, 31st, etc.)
- **Smart scheduling** - random delivery in a configurable 7-9 AM (timezone-aware) window with persistence across restarts
- **Smart skipping** - won't send if you already messaged
- **Formal/informal modes** - first name vs last name with titles
- **Multi-language** - English, German, and Italian support
- **CSV-based** - easy to manage birthdays
- **No signatures** - clean, natural messages
- See [BIRTHDAY_PLUGIN.md](BIRTHDAY_PLUGIN.md) for full documentation

### 🎬 Profile Cinema
- **Automatic profile picture rotation** driven by a movie file (MP4/MKV)
- **Key-frame aware** seeking so the bot always jumps to the next natural frame even when behind
- **Interval based**: advance one key frame every `PROFILE_MESSAGE_INTERVAL` received messages (see details below)
- **Optimized uploads**: downscales/compresses frames to stay below 100 KB before sending to WhatsApp
- **Progress tracking**: `!cinema-progress` (authorized users only) shows frame/index/timestamp without revealing the movie title
- **Persistent state**: remembers progress and movie fingerprint across restarts and when the source file changes

### 🔐 Security & Control
- **Authorization system** - only specified numbers can use commands
- **Friendly auto-reply** for unauthorized users
- **No public access** - completely private

### 🌍 Multi-Language
- Bot messages in **English, German, and Italian**
- Configurable via `BOT_LANGUAGE` environment variable
- Transcription auto-detects spoken language

### 🔌 Extensible
- **Plugin architecture** - easy to add new features
- Clean separation of concerns
- Well-documented code

### 🐳 DevOps Ready
- **Docker** - runs in container
- **Persistent storage** - WhatsApp session and config
- **QR code authentication** - easy setup
- **Auto-restart** on crashes

## Architecture Highlights

### Race Condition Solution
The bot handles the critical race condition where:
1. Long voice message starts transcribing
2. Short voice message arrives 20 seconds later
3. Short transcription finishes first

**Solution**: Each transcription replies to the original voice message (quoted), so even if transcriptions finish out of order, they're always correctly associated with their source message.

### Plugin System
- Easy to add new plugins
- Each plugin can handle messages and commands
- Plugins register their commands dynamically for !help

## Prerequisites

- Docker and Docker Compose
- OpenAI API key
- WhatsApp account

## Installation

1. **Clone and navigate to project**:
   ```bash
   cd /path/to/whatsapp-transcription-bot
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` and add your credentials**:
   ```env
   OPENAI_API_KEY=sk-your-actual-api-key
   AUTHORIZED_NUMBERS=+1234567890,+0987654321
   ```

4. **Build and start the bot**:
   ```bash
   docker-compose up --build
   ```

5. **Scan the QR code** displayed in the console with WhatsApp

6. **Done!** The bot is now running.

## Usage

### Commands

All commands start with `!` and are only available to authorized numbers.

#### General Commands
- `!help` - Show all available commands and plugins
- `!chatid` - Get the current chat ID
- `!plugins` - Open the Plugin Manager to enable/disable plugins

#### Transcription Commands
- `!t` - Manually transcribe a quoted voice message (reply to a voice message with !t)
- `!transcription` - Show current transcription settings
- `!transcription on` - Enable automatic transcription for this chat
- `!transcription off` - Disable automatic transcription for this chat
- `!transcription global on` - Enable transcription globally for all chats
- `!transcription global off` - Disable transcription globally for all chats

#### Birthday Wishes Commands
- `!birthdays` - Show numbered list of all birthdays
- `!birthdays-reload` - Reload the birthday CSV file
- `!birthdays-test <number>` - Generate and preview a test birthday message

#### Plugin Manager Commands
- `!plugins` - Show list of all plugins and their status
- `!plugins <number>` - Toggle a plugin by its number (e.g. `!plugins 1`)
- `!plugins <numbers>` - Toggle multiple plugins (e.g. `!plugins 1, 3`)
- `!plugins on` - Enable all plugins
- `!plugins off` - Disable all plugins

#### Profile Cinema Commands
- `!cinema-progress` - Show the current frame/timestamp/percentage (authorized senders only)

**Profile Cinema Interval Basics:**
- Every inbound (non-bot) message increments an internal counter.
- When the counter reaches `PROFILE_MESSAGE_INTERVAL`, it resets and the bot jumps to the *next* key frame extracted via `ffprobe`.
- Only one key frame is advanced per interval; if the bot was offline, it still resumes from the next queued frame without skipping.
- Example: with `PROFILE_MESSAGE_INTERVAL=10`, the 10th, 20th, 30th… message will trigger a new frame.

**See [BIRTHDAY_PLUGIN.md](BIRTHDAY_PLUGIN.md) for complete birthday wishes documentation.**

### Automatic Transcription

When automatic transcription is enabled (globally or per-chat):
- ✅ Received voice messages are automatically transcribed
- ✅ Sent voice messages are automatically transcribed
- ✅ Transcription is posted as a reply to the original voice message
- ✅ Multiple transcriptions in parallel are handled correctly

### Authorization

Non-authorized users who send commands will receive a friendly message:
```
👋 Hello! Thanks for reaching out.

This is an automated bot that assists with various tasks.
However, access is currently restricted to authorized users only.

Have a great day!
```

## Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.js                           # Entry point
│   ├── bot.js                             # Bot initialization
│   ├── config.js                          # Configuration
│   ├── middleware/
│   │   └── auth.js                        # Authorization
│   ├── commands/
│   │   └── command-handler.js             # Command routing & !help & !chatid
│   ├── plugins/
│   │   ├── plugin-manager.js              # Plugin system
│   │   ├── transcription/
│   │   │   ├── index.js                   # Transcription plugin
│   │   │   ├── transcription-service.js   # GPT-4o integration
│   │   │   └── message-tracker.js         # Race condition handler
│   │   └── birthday/
│   │       ├── index.js                   # Birthday plugin
│   │       ├── birthday-scheduler.js      # Scheduling & sending
│   │       ├── message-generator.js       # GPT-4o message generation
│   │       ├── message-tracker.js         # Daily message tracking
│   │       └── csv-loader.js              # CSV validation & loading
│   └── utils/
│       ├── storage.js                     # Settings persistence
│       └── i18n.js                        # Internationalization (EN/DE)
├── tests/                                 # Test suite
│   ├── utils/                             # Utility tests
│   ├── middleware/                        # Middleware tests
│   ├── commands/                          # Command tests
│   ├── plugins/                           # Plugin tests
│   │   ├── birthday/                      # Birthday plugin tests
│   │   └── transcription/                 # Transcription plugin tests
│   └── fixtures/                          # Test data
├── data/                                  # Persisted data (auto-created)
│   ├── .wwebjs_auth/                     # WhatsApp session
│   ├── .wwebjs_cache/                    # WhatsApp cache
│   ├── config.json                       # Bot settings
│   ├── birthdays.csv                     # Birthday data (create from example)
│   ├── birthdays.csv.example             # Example birthday CSV
│   ├── birthday-message-tracker.json     # Tracks chats already messaged today
│   ├── profile-movie-progress.json       # State for Profile Cinema plugin
│   ├── reminders.json                    # Persisted reminder list + schedule metadata
│   └── temp/                             # Temporary audio files
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example                          # Environment variables template
├── .gitignore
├── .dockerignore
├── LICENSE                               # MIT License
├── README.md                             # Main documentation
├── BIRTHDAY_PLUGIN.md                    # Birthday plugin documentation
└── TESTING.md                            # Testing documentation
```

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | Yes | OpenAI API key | `sk-proj-...` |
| `AI_PROVIDER` | No | AI provider: `openai` (default) or `openrouter` | `openai` |
| `OPENAI_TRANSCRIPTION_MODEL` | No | Transcription model used with the OpenAI provider | `gpt-4o-transcribe` (default) |
| `OPENAI_CHAT_MODEL` | No | Chat model used for message generation with the OpenAI provider | `gpt-4o` (default) |
| `OPENROUTER_API_KEY` | Only when `AI_PROVIDER=openrouter` | OpenRouter API key | `sk-or-v1-...` |
| `OPENROUTER_BASE_URL` | No | OpenRouter-compatible API base URL (OpenAI SDK `baseURL`) | `https://openrouter.ai/api/v1` (default) |
| `OPENROUTER_TRANSCRIPTION_MODEL` | No | OpenRouter model slug used for transcription | `openai/whisper-large-v3` (default) |
| `OPENROUTER_CHAT_MODEL` | No | OpenRouter model slug used for message generation | `openai/gpt-4o` (default) |
| `OPENROUTER_HTTP_REFERER` | No | Optional HTTP-Referer header sent to OpenRouter (site URL) | `https://example.com` |
| `OPENROUTER_APP_TITLE` | No | Optional X-OpenRouter-Title header sent to OpenRouter | `WhatsApp Transcription Bot` |
| `AUTHORIZED_NUMBERS` | Yes | Comma-separated phone numbers with country code | `+1234567890,+0987654321` |
| `BOT_LANGUAGE` | No | Bot message language (`en`, `de`, or `it`) | `en` (default) |
| `BOT_TIMEZONE` | No | IANA timezone identifier for all scheduling. If not set, uses system timezone | `Europe/Zurich`, `America/New_York` |
| `BIRTHDAY_CHECK_HOUR` | No | Hour (0-23) when the birthday CSV reload + scheduling runs | `6` |
| `BIRTHDAY_WINDOW_START` | No | Start hour for the birthday send window | `7` |
| `BIRTHDAY_WINDOW_END` | No | End hour for the birthday send window | `9` |
| `REMINDER_CHECK_HOUR` | No | Hour (0-23) when reminders are reloaded/scheduled | `6` |
| `REMINDER_SEND_HOUR` | No | Hour reminders fire (timezone-aware) | `7` |
| `REMINDER_SEND_MINUTE` | No | Minute reminders fire | `7` |
| `PROFILE_MOVIE_PATH` | No | Absolute/relative path to the MP4/MKV file used for Profile Cinema | `./data/profile.mp4` |
| `PROFILE_MESSAGE_INTERVAL` | No | Advance one key frame after this many received messages | `25` |
| `PROFILE_FRAME_MAX_KB` | No | Maximum allowed size for the generated JPEG (defaults to 100 KB) | `90` |
| `LOG_LEVEL` | No | Lowest level that is logged: `debug`, `info`, `warn` or `error` | `info` (default) |
| `LOG_FORMAT` | No | Unset: one line per record, `2026-10-24 08:50:21 INFO     Bot: WhatsApp client ready` (Swiss local time, whatever `BOT_TIMEZONE` is); `json`: one JSON object per line | `json` |

Both schedulers run with `node-cron` in the configured timezone, persist their queue state to `data/`, and reschedule anything missed during restarts so reminders and birthday wishes still go out even if the container was offline earlier.

### Timezone Configuration

The bot uses a single timezone setting (`BOT_TIMEZONE`) for all scheduling operations (birthdays and reminders). This ensures consistency across all time-based features.

**Behavior:**
- If `BOT_TIMEZONE` is set in the environment, that timezone is used
- If not set, the bot auto-detects the system timezone using `Intl.DateTimeFormat()`
- Falls back to `Europe/Berlin` if timezone detection fails
- The selected timezone is printed at startup along with its source

**Example startup output:**
```
2026-10-24 08:50:21 INFO     Startup: Timezone configured timezone=Europe/Zurich source="BOT_TIMEZONE env var"
```

or:

```
2026-10-24 08:50:21 INFO     Startup: Timezone configured timezone=America/New_York source=auto-detected
```

**Why this matters:** All date-based operations (birthday tracking, reminder scheduling, daily message tracking) use this timezone to determine "today" and when to trigger events. If you're in `Europe/Zurich` but the bot uses `America/New_York`, birthday wishes might arrive at unexpected times.

### Phone Number Format

Phone numbers must include the country code with a `+` prefix:
- ✅ Correct: `+1234567890`
- ❌ Wrong: `1234567890` or `+1-234-567-890`

### Language Configuration

The bot supports multiple languages for its messages and responses. Set the `BOT_LANGUAGE` environment variable:
- `en` - English (default)
- `de` - German (Deutsch)
- `it` - Italian (Italiano)

All bot messages, error messages, help text, and command responses will be in the selected language. The transcription itself will auto-detect the spoken language in the audio.

**Example:**
```env
BOT_LANGUAGE=de
```

### Persistent Storage

The `./data` directory is mounted as a volume and contains:
- WhatsApp authentication session (so you don't need to scan QR every time)
- Bot configuration and settings
- Temporary audio files during processing

## Maintenance

### Automated Docker Publishing
The repository ships with `.github/workflows/docker-publish.yml`, which builds, tests, and pushes the container to Docker Hub whenever `main` changes or when triggered manually. To enable it:
1. Create repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Docker access token).
2. Optionally adjust the workflow triggers or image name (`${{ secrets.DOCKERHUB_USERNAME }}/whatsapp-transcription-bot`).
3. Pushing to `main` (or running the workflow manually) will run `npm test`, build the image with Buildx, and publish both `latest` and `sha` tags.

### View Logs
```bash
docker-compose logs -f
```

### Restart Bot
```bash
docker-compose restart
```

### Stop Bot
```bash
docker-compose down
```

### Reset WhatsApp Session
If you need to re-authenticate:
```bash
rm -rf data/.wwebjs_auth data/.wwebjs_cache
docker-compose restart
```

## Development

### Running Without Docker
```bash
npm install
export OPENAI_API_KEY="sk-your-key"
export AUTHORIZED_NUMBERS="+1234567890"
npm start
```

### Running Tests

The project includes comprehensive tests using Node.js built-in test runner.

**Run all tests:**
```bash
npm test
```

**Run tests in watch mode:**
```bash
npm run test:watch
```

**Run tests with coverage:**
```bash
npm run test:coverage
```

**See [TESTING.md](TESTING.md) for complete testing documentation.**

### Adding New Plugins

1. Create a new plugin file in `src/plugins/your-plugin/index.js`
2. Implement the plugin interface:
   ```javascript
   export class YourPlugin {
     constructor() {
       this.name = 'Your Plugin Name';
       this.description = 'Plugin description';
       this.commands = [
         { command: 'yourcommand', description: 'Command description' }
       ];
     }

     shouldHandle(message) {
       // Return true if this plugin should handle the message
       return false;
     }

     async onMessage(message) {
       // Handle automatic message processing
     }

     async onCommand(command, args, message) {
       // Handle command execution
     }
   }
   ```
3. Register in `src/bot.js`:
   ```javascript
   import { YourPlugin } from './plugins/your-plugin/index.js';
   const yourPlugin = new YourPlugin();
   pluginManager.register(yourPlugin);
   ```

## Technical Details

### AI Provider
The bot supports two AI providers, selected with `AI_PROVIDER`:

- **`openai`** (default) - talks directly to the OpenAI API using `OPENAI_API_KEY`.
  - Transcription model: `gpt-4o-transcribe` (override with `OPENAI_TRANSCRIPTION_MODEL`)
  - Chat model: `gpt-4o` (override with `OPENAI_CHAT_MODEL`)
- **`openrouter`** - routes all AI calls through [OpenRouter](https://openrouter.ai) using `OPENROUTER_API_KEY`. OpenRouter reuses the OpenAI-compatible `/api/v1/audio/transcriptions` endpoint, so the same OpenAI SDK client is used with its `baseURL` pointed at `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`).
  - Model slugs are namespaced, e.g. `openai/whisper-large-v3` for transcription (override with `OPENROUTER_TRANSCRIPTION_MODEL`) and `openai/gpt-4o` for message generation (override with `OPENROUTER_CHAT_MODEL`).
  - Optional `HTTP-Referer` and `X-OpenRouter-Title` headers are sent when `OPENROUTER_HTTP_REFERER` / `OPENROUTER_APP_TITLE` are set.

Transcription requirements apply to both providers:
- Native support for OGG/Opus format (WhatsApp's audio format)
- No audio conversion needed
- 25MB file size limit (audio is uploaded as multipart form data)
- 5-minute timeout per transcription

### Race Condition Handling
The `MessageTracker` class ensures:
- Each transcription is tracked with a unique message ID
- Duplicate transcriptions are prevented
- Transcriptions are processed in parallel (no blocking)
- Each result is replied to its original message (quoted)
- Failed transcriptions are cleaned up properly

### Security
- Authorization middleware checks every command
- Non-privileged operations (transcription) work for authorized users only
- Container runs as root when volume is owned by root on host (for permission compatibility)
- No secrets in logs

### Docker Deployment

**Volume Permissions:**
The container is designed to work with host-mounted volumes. If your host directories (e.g., `/opt/data/whatsapp/data`) are owned by root, the container will run as root to ensure proper file access. This is the recommended configuration for production deployments where the host filesystem is managed by root.

**Directory Structure:**
The container automatically creates necessary subdirectories on startup via the entrypoint script:
- `/app/data/temp` - Temporary audio files
- `/app/data/.wwebjs_auth` - WhatsApp session data
- `/app/data/.wwebjs_cache` - WhatsApp cache

**Environment Variables:**
Pass environment variables through docker-compose.yml or directly with `docker run -e`:
```yaml
environment:
  - OPENAI_API_KEY=${OPENAI_API_KEY}
  - AUTHORIZED_NUMBERS=${AUTHORIZED_NUMBERS}
  - BOT_LANGUAGE=${BOT_LANGUAGE:-en}
  - BOT_TIMEZONE=${BOT_TIMEZONE:-}
```

## Troubleshooting

### QR Code Not Showing
- Ensure `stdin_open: true` and `tty: true` are set in docker-compose.yml
- Check logs: `docker-compose logs -f`

### Transcription Fails
- Verify `OPENAI_API_KEY` is valid
- When using `AI_PROVIDER=openrouter`: verify `OPENROUTER_API_KEY` is set and the model slug is namespaced (e.g. `openai/whisper-large-v3`, not bare `whisper-1`); check the exact slug against https://openrouter.ai/models
- Check API quota/billing
- View detailed logs for error messages

### No Authorization
- Ensure `AUTHORIZED_NUMBERS` is set correctly with country code
- Format: `+1234567890` (no spaces, dashes, or parentheses)

### Bot Not Responding
- Check if bot is authenticated (look for "WhatsApp client ready")
- Verify authorized number format
- Check command syntax (must start with `!`)

### Permission Denied Errors in Container
If you see `EACCES: permission denied, mkdir '/app/data/...'` errors:

**Cause:** Mismatch between container user and host volume ownership.

**Solution:** The container runs as root by default to match root-owned host directories. If your host directories are owned by a different user:

1. **Option 1 (Recommended):** Run container as your host user ID:
   ```yaml
   services:
     whatsapp-bot:
       user: "${UID:-1000}:${GID:-1000}"
   ```
   Then start with: `UID=$(id -u) GID=$(id -g) docker-compose up`

2. **Option 2:** Ensure host directory has proper permissions:
   ```bash
   sudo chown -R 1000:1000 /path/to/data
   ```

3. **Option 3:** Use relaxed permissions (less secure):
   ```bash
   chmod -R 777 /path/to/data
   ```

### Birthday Wishes Sent Despite Message at Midnight
If you sent a message just after midnight (00:00-01:00) but the bot still sent birthday wishes:

**Cause:** The bot uses the configured `BOT_TIMEZONE` to determine "today". A message at 00:03 in your local time might be in a different day in the bot's timezone.

**Solution:** Ensure `BOT_TIMEZONE` matches your local timezone:
```env
BOT_TIMEZONE=Europe/Zurich
```

Check the timezone at startup in the logs:
```
2026-10-24 08:50:21 INFO     Startup: Timezone configured timezone=Europe/Zurich source="BOT_TIMEZONE env var"
```

## Cost Estimation

*Prices below refer to the **default OpenAI provider** (`AI_PROVIDER=openai`). With `AI_PROVIDER=openrouter`, costs vary by the chosen model and provider — check https://openrouter.ai/models for current pricing.*

GPT-4o-transcribe pricing: **$0.006 per minute** of audio

Examples:
- 1 minute voice message: $0.006
- 10 minutes/day = ~$1.80/month
- 100 voice messages/day (avg 30 sec each) = ~$3/month

Very affordable for personal/small team use!

## Recent Updates

### Version 1.2.0 (2025-12-06)

**New Features:**
- ✅ **Plugin Manager**: Enable/disable plugins directly from WhatsApp with `!plugins`
- ✅ **Interactive Menu**: Text-based menu to view status and toggle plugins
- ✅ **Global Message Filter**: Automatically ignores messages received before bot startup (prevents history flood)
- ✅ **Persistence**: Plugin states are saved and restored across restarts

### Version 1.1.0 (2025-11-21)

**New Features:**
- ✅ Timezone configuration via `BOT_TIMEZONE` environment variable
- ✅ Auto-detection of system timezone when `BOT_TIMEZONE` not set
- ✅ Timezone information displayed at startup with source
- ✅ Docker entrypoint script ensures data directories exist

**Improvements:**
- Fixed container permission issues with root-owned volumes
- Removed non-root user requirement for better volume compatibility
- Clarified birthday message tracking logic
- Updated documentation with timezone and Docker deployment details

**Configuration:**
- Added `BOT_TIMEZONE` to `.env.example` and `docker-compose.yml`
- Consistent timezone handling across all scheduler plugins

### Version 1.0.0

**Features:**
- ✅ Voice message transcription with GPT-4o-transcribe
- ✅ AI-generated birthday wishes with GPT-4o
- ✅ Birthday message testing with `!birthdays-test`
- ✅ Multi-language support (EN/DE/IT)
- ✅ Comprehensive test suite
- ✅ Docker deployment

**Improvements:**
- Fixed `!chatid` command to return correct chat ID (not sender ID)
- Added numbered birthday list for easy testing
- Birthday wishes now use GPT-4o for unique, personalized messages
- Proper ordinal number handling (21st, 22nd, 31st, etc.)
- No dashes in generated birthday messages
- First/last name split for proper formal addressing

**Testing:**
- 50+ unit tests covering core functionality
- CSV validation tests
- Race condition handling tests
- Authorization tests
- Multi-language tests

## License

MIT
