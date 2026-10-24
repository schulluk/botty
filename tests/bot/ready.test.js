import { after, describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';

// The plugins create their OpenAI client when they are imported
process.env.OPENAI_API_KEY ??= 'test-key';
const { WhatsAppBot } = await import('../../src/bot.js');
const { messageTracker } = await import('../../src/plugins/transcription/message-tracker.js');

// Its cleanup interval would keep the test process running
after(() => messageTracker.destroy());

describe('WhatsAppBot', () => {
  describe('ready event', () => {
    it('should initialize the plugins only once when ready fires again', async () => {
      const bot = new WhatsAppBot();
      bot.client = new EventEmitter();
      let initializeCalls = 0;
      const plugin = { initialize: async () => { initializeCalls++; } };
      bot.transcriptionPlugin = plugin;
      bot.birthdayPlugin = plugin;
      bot.reminderPlugin = plugin;
      bot.profileCinemaPlugin = plugin;
      bot.registerEventHandlers();

      // Called directly so that the async handler can be awaited (emit() does not wait)
      const [onReady] = bot.client.listeners('ready');
      await onReady();
      await onReady();

      assert.strictEqual(initializeCalls, 4);
      assert.strictEqual(bot.isReady, true);
    });
  });
});
