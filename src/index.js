import { WhatsAppBot } from './bot.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// Validate required environment variables
if (!config.ai[config.ai.provider].apiKey) {
  const apiKeyEnv = config.ai.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY';
  logger.error('Startup', `${apiKeyEnv} environment variable is required`);
  process.exit(1);
}

if (config.auth.authorizedNumbers.length === 0) {
  logger.warn('Startup', 'No authorized numbers configured', {
    hint: 'Set AUTHORIZED_NUMBERS environment variable, e.g. "+1234567890,+0987654321"'
  });
}

// Print timezone information
logger.info('Startup', 'Timezone configured', {
  timezone: config.scheduler.timezone,
  source: process.env.BOT_TIMEZONE ? 'BOT_TIMEZONE env var' : 'auto-detected'
});

// Create and initialize bot
const bot = new WhatsAppBot();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  logger.info('Startup', 'Received SIGINT, shutting down');
  await bot.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Startup', 'Received SIGTERM, shutting down');
  await bot.destroy();
  process.exit(0);
});

// A crash becomes one error record with its stack instead of Node's bare stack trace. The exit
// code stays 1, so Docker restarts the bot as before.
process.on('uncaughtException', (error) => {
  logger.errorWithStack('Startup', 'Uncaught exception, exiting', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.errorWithStack('Startup', 'Unhandled promise rejection, exiting', reason);
  process.exit(1);
});

// Start bot
bot.initialize().catch((error) => {
  logger.errorWithStack('Startup', 'Failed to initialize bot', error);
  process.exit(1);
});
