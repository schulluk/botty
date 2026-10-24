import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get system timezone if BOT_TIMEZONE is not set
const getTimezone = () => {
  if (process.env.BOT_TIMEZONE) {
    return process.env.BOT_TIMEZONE;
  }

  // Try to get system timezone
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    logger.warn('Config', 'Could not detect system timezone, defaulting to Europe/Berlin');
    return 'Europe/Berlin';
  }
};

export const config = {
  // AI Configuration
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    temperature: 0,
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
      chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o'
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      httpReferer: process.env.OPENROUTER_HTTP_REFERER,
      appTitle: process.env.OPENROUTER_APP_TITLE,
      transcriptionModel: process.env.OPENROUTER_TRANSCRIPTION_MODEL || 'openai/whisper-large-v3',
      chatModel: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o'
    }
  },

  // WhatsApp Configuration
  whatsapp: {
    authPath: join(__dirname, '../data/.wwebjs_auth'),
    cachePath: join(__dirname, '../data/.wwebjs_cache'),
    webVersion: process.env.WEB_VERSION || null, // e.g., '2.3000.1029960097-alpha'
    puppeteerArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  },

  // Authorization
  auth: {
    authorizedNumbers: process.env.AUTHORIZED_NUMBERS
      ? process.env.AUTHORIZED_NUMBERS.split(',').map(n => n.trim())
      : [],
    // If true, the bot will not reply to unauthorized commands (default: true)
    silenceUnauthorized: process.env.SILENCE_UNAUTHORIZED !== 'false'
  },

  // Storage
  storage: {
    configPath: join(__dirname, '../data/config.json'),
    tempAudioPath: join(__dirname, '../data/temp')
  },

  scheduler: {
    timezone: getTimezone(),
    birthday: {
      checkHour: Number.parseInt(process.env.BIRTHDAY_CHECK_HOUR || '6', 10),
      windowStartHour: Number.parseInt(process.env.BIRTHDAY_WINDOW_START || '7', 10),
      windowEndHour: Number.parseInt(process.env.BIRTHDAY_WINDOW_END || '9', 10)
    },
    reminders: {
      checkHour: Number.parseInt(process.env.REMINDER_CHECK_HOUR || '6', 10),
      sendHour: Number.parseInt(process.env.REMINDER_SEND_HOUR || '7', 10),
      sendMinute: Number.parseInt(process.env.REMINDER_SEND_MINUTE || '7', 10)
    }
  },

  profileMovie: {
    enabled: Boolean(process.env.PROFILE_MOVIE_PATH),
    moviePath: process.env.PROFILE_MOVIE_PATH,
    messageInterval: Number.parseInt(process.env.PROFILE_MESSAGE_INTERVAL || '25', 10),
    progressStorePath: join(__dirname, '../data/profile-movie-progress.json'),
    maxUploadKilobytes: Number.parseInt(process.env.PROFILE_FRAME_MAX_KB || '100', 10)
  },

  // Transcription Settings
  transcription: {
    maxFileSizeMB: 25,
    timeoutMs: 300000, // 5 minutes
    defaultLanguage: process.env.TRANSCRIPTION_LANGUAGE?.toLowerCase() || null, // Auto-detect if not set
    cleanupIntervalMs: 3600000, // 1 hour
    maxAgeMs: 2592000000 // 30 days
  },

  // Bot Language (for messages)
  language: process.env.BOT_LANGUAGE || 'en', // en, de, or it

  // Debug Settings
  debug: process.env.DEBUG === 'true'
};
