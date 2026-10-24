import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { config } from './config.js';
import { storage } from './utils/storage.js';
import { i18n } from './utils/i18n.js';
import { logger } from './utils/logger.js';
import { pluginManager } from './plugins/plugin-manager.js';
import { CommandHandler } from './commands/command-handler.js';
import { TranscriptionPlugin } from './plugins/transcription/index.js';
import { messageTracker } from './plugins/transcription/message-tracker.js';
import { BirthdayPlugin } from './plugins/birthday/index.js';
import { ReminderPlugin } from './plugins/reminder/index.js';
import { ProfileCinemaPlugin } from './plugins/profile-cinema/index.js';
import { responseHelper } from './utils/response-helper.js';
import { getModel } from './utils/ai.js';

export class WhatsAppBot {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.pluginsInitialized = false;
    this.transcriptionPlugin = null;
    this.birthdayPlugin = null;
    this.reminderPlugin = null;
    this.profileCinemaPlugin = null;
    this.startTime = Math.floor(Date.now() / 1000);
  }

  async initialize() {
    logger.info('Bot', 'Initializing WhatsApp Bot');

    // Set language from config
    i18n.setLanguage(config.language);
    logger.info('Bot', 'Language configured', { language: config.language });

    // Create WhatsApp client with authentication
    const clientConfig = {
      authStrategy: new LocalAuth({
        dataPath: config.whatsapp.authPath
      }),
      puppeteer: {
        headless: true,
        args: config.whatsapp.puppeteerArgs,
        ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
        })
      }
    };

    // Configure web version cache
    if (config.whatsapp.webVersion) {
      clientConfig.webVersionCache = {
        type: 'remote',
        remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${config.whatsapp.webVersion}.html`
      };
    } else {
      clientConfig.webVersionCache = {
        type: 'local',
        path: config.whatsapp.cachePath
      };
    }

    this.client = new Client(clientConfig);

    // Register event handlers
    this.registerEventHandlers();

    // Register debug handlers for all other events (if enabled)
    if (config.debug) {
      this.registerDebugHandlers();
    }

    // Register plugins
    this.registerPlugins();

    // Initialize client with a startup timeout
    logger.info('Bot', 'Launching Chromium and connecting to WhatsApp Web', {
      executablePath: clientConfig.puppeteer.executablePath || '(bundled)',
      args: clientConfig.puppeteer.args
    });

    const startupTimeoutMs = 300_000; // 5 minutes
    const startupTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(
        `WhatsApp client initialization timed out after ${startupTimeoutMs / 1000}s — ` +
        'Chromium may have failed to launch or WhatsApp Web failed to load. ' +
        `Try clearing the cache: rm -rf ${config.whatsapp.cachePath}`
      )), startupTimeoutMs);
    });

    await Promise.race([this.client.initialize(), startupTimeout]);
  }

  registerEventHandlers() {
    // QR Code generation
    this.client.on('qr', (qr) => {
      logger.info('Bot', 'QR code generated, scan with WhatsApp');
      qrcode.generate(qr, { small: true });
      logger.info('Bot', 'Waiting for authentication');
    });

    // Authentication success
    this.client.on('authenticated', () => {
      logger.info('Bot', 'Authentication successful');
    });

    // Ready
    this.client.on('ready', async () => {
      logger.info('Bot', 'WhatsApp client ready');
      this.isReady = true;

      // `ready` fires again when WhatsApp Web reloads (right after startup, after reconnects).
      // The plugins keep using the same client, so they are set up once: each further
      // initialize() started another set of schedulers, and every daily check ran twice.
      if (this.pluginsInitialized) {
        return;
      }
      this.pluginsInitialized = true;
      this.logBotInfo();

      // Initialize response helper with client
      responseHelper.setClient(this.client);

      // Initialize transcription plugin (needs client to be ready)
      if (this.transcriptionPlugin) {
        await this.transcriptionPlugin.initialize(this.client);
      }

      // Initialize birthday plugin (needs client to be ready)
      if (this.birthdayPlugin) {
        await this.birthdayPlugin.initialize(this.client);
      }

      // Initialize reminder plugin (needs client to be ready)
      if (this.reminderPlugin) {
        await this.reminderPlugin.initialize(this.client);
      }

      if (this.profileCinemaPlugin) {
        await this.profileCinemaPlugin.initialize(this.client);
      }
    });

    // Message received
    this.client.on('message', async (message) => {
      await this.handleMessage(message);
    });

    // Message created (sent by bot/user)
    this.client.on('message_create', async (message) => {
      // Also handle sent voice messages for transcription
      if (message.fromMe) {
        await this.handleMessage(message);
      }
    });

    // Disconnected
    this.client.on('disconnected', (reason) => {
      logger.warn('Bot', 'WhatsApp Bot disconnected', { reason });
      this.isReady = false;
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      logger.error('Bot', 'Authentication failed', { message: msg });
      process.exit(1);
    });
  }

  registerDebugHandlers() {
    logger.debug('Bot', 'Registering debug event handlers');

    // Authentication & Connection Events
    this.client.on('code', (code) => {
      logger.debug('Bot', 'Event: code', { code });
    });

    this.client.on('loading_screen', (percent, message) => {
      logger.debug('Bot', 'Event: loading_screen', { percent, message });
    });

    this.client.on('remote_session_saved', () => {
      logger.debug('Bot', 'Event: remote_session_saved');
    });

    // Message Events
    this.client.on('message_ciphertext', (msg) => {
      logger.debug('Bot', 'Event: message_ciphertext', { msg });
    });

    this.client.on('message_revoke_everyone', async (after, before) => {
      logger.debug('Bot', 'Event: message_revoke_everyone', {
        afterId: after?.id?._serialized,
        beforeId: before?.id?._serialized
      });
    });

    this.client.on('message_revoke_me', async (message) => {
      logger.debug('Bot', 'Event: message_revoke_me', {
        messageId: message?.id?._serialized
      });
    });

    this.client.on('message_ack', (message, ack) => {
      const ackStatus = ['error', 'pending', 'sent', 'delivered', 'read', 'played'][ack + 1] || ack;
      logger.debug('Bot', 'Event: message_ack', {
        messageId: message?.id?._serialized,
        status: ackStatus
      });
    });

    this.client.on('message_edit', (message, newBody, prevBody) => {
      logger.debug('Bot', 'Event: message_edit', {
        messageId: message?.id?._serialized,
        prevBody,
        newBody
      });
    });

    this.client.on('message_reaction', (reaction) => {
      logger.debug('Bot', 'Event: message_reaction', {
        messageId: reaction?.msgId?._serialized,
        reaction: reaction?.reaction,
        senderId: reaction?.senderId
      });
    });

    this.client.on('media_uploaded', (message) => {
      logger.debug('Bot', 'Event: media_uploaded', {
        messageId: message?.id?._serialized
      });
    });

    this.client.on('unread_count', (chat) => {
      logger.debug('Bot', 'Event: unread_count', {
        chatId: chat?.id?._serialized,
        unreadCount: chat?.unreadCount
      });
    });

    this.client.on('vote_update', (vote) => {
      logger.debug('Bot', 'Event: vote_update', { vote });
    });

    // Group Events
    this.client.on('group_join', (notification) => {
      logger.debug('Bot', 'Event: group_join', {
        chatId: notification?.chatId?._serialized,
        who: notification?.recipientIds || notification?.author
      });
    });

    this.client.on('group_leave', (notification) => {
      logger.debug('Bot', 'Event: group_leave', {
        chatId: notification?.chatId?._serialized,
        who: notification?.recipientIds || notification?.author
      });
    });

    this.client.on('group_update', (notification) => {
      logger.debug('Bot', 'Event: group_update', {
        chatId: notification?.chatId?._serialized,
        author: notification?.author,
        type: notification?.type
      });
    });

    this.client.on('group_admin_changed', (notification) => {
      logger.debug('Bot', 'Event: group_admin_changed', {
        chatId: notification?.chatId?._serialized,
        who: notification?.recipientIds,
        type: notification?.type
      });
    });

    this.client.on('group_membership_request', (notification) => {
      logger.debug('Bot', 'Event: group_membership_request', {
        chatId: notification?.chatId?._serialized,
        author: notification?.author
      });
    });

    // Chat Events
    this.client.on('chat_removed', (chat) => {
      logger.debug('Bot', 'Event: chat_removed', {
        chatId: chat?.id?._serialized
      });
    });

    this.client.on('chat_archived', (chat, currState, prevState) => {
      logger.debug('Bot', 'Event: chat_archived', {
        chatId: chat?.id?._serialized,
        prevState,
        currState
      });
    });

    // Device & Status Events
    this.client.on('change_state', (state) => {
      logger.debug('Bot', 'Event: change_state', { state });
    });

    this.client.on('change_battery', (batteryInfo) => {
      logger.debug('Bot', 'Event: change_battery', {
        battery: batteryInfo?.battery,
        plugged: batteryInfo?.plugged
      });
    });

    this.client.on('call', (call) => {
      logger.debug('Bot', 'Event: call', {
        id: call?.id,
        from: call?.from,
        isGroup: call?.isGroup,
        isVideo: call?.isVideo
      });
    });

    // Other Events
    this.client.on('contact_changed', (message, oldId, newId, isContact) => {
      logger.debug('Bot', 'Event: contact_changed', { oldId, newId, isContact });
    });

    logger.debug('Bot', 'Debug event handlers registered');
  }

  registerPlugins() {
    logger.info('Bot', 'Registering plugins');

    // Register transcription plugin
    this.transcriptionPlugin = new TranscriptionPlugin();
    pluginManager.register(this.transcriptionPlugin);

    // Register birthday plugin (will be initialized when client is ready)
    this.birthdayPlugin = new BirthdayPlugin();
    pluginManager.register(this.birthdayPlugin);

    // Register reminder plugin (will be initialized when client is ready)
    this.reminderPlugin = new ReminderPlugin();
    pluginManager.register(this.reminderPlugin);

    // Register profile cinema plugin
    this.profileCinemaPlugin = new ProfileCinemaPlugin();
    pluginManager.register(this.profileCinemaPlugin);

    logger.info('Bot', 'Plugins registered successfully');
  }

  async handleMessage(message) {
    try {
      // Skip status messages
      if (message.isStatus) {
        return;
      }

      // Ignore old messages
      if (message.timestamp && message.timestamp < this.startTime) {
        logger.debug('Bot', 'Ignoring old message', {
          from: message.from,
          messageTimestamp: message.timestamp,
          startTime: this.startTime
        });
        return;
      }

      // Log message
      logger.info('Bot', 'Message received', {
        from: message.from,
        type: message.type,
        body: message.body || '(media)',
        fromMe: message.fromMe
      });

      // Check if it's a command
      const isCommand = await CommandHandler.handle(message);

      if (isCommand) {
        return;
      }

      // Delegate to plugins for automatic handling
      await pluginManager.handleMessage(message);
    } catch (error) {
      logger.errorWithStack('Bot', 'Error handling message', error);
    }
  }

  logBotInfo() {
    logger.info('Bot', 'Bot configuration', {
      model: getModel('chat'),
      authorizedNumbers: config.auth.authorizedNumbers.length > 0
        ? config.auth.authorizedNumbers
        : 'None (warning!)',
      globalTranscription: storage.getGlobalTranscription() ? 'Enabled' : 'Disabled'
    });
  }

  async destroy() {
    // Cleanup birthday plugin
    if (this.birthdayPlugin) {
      this.birthdayPlugin.destroy();
    }

    // Cleanup reminder plugin
    if (this.reminderPlugin && this.reminderPlugin.scheduler) {
      this.reminderPlugin.scheduler.stop();
    }

    if (this.profileCinemaPlugin) {
      await this.profileCinemaPlugin.destroy();
    }

    // Cleanup message tracker
    messageTracker.destroy();

    if (this.client) {
      await this.client.destroy();
      logger.info('Bot', 'Bot destroyed');
    }
  }
}
