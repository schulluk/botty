import { TranscriptionService } from './transcription-service.js';
import { i18n } from '../../utils/i18n.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

export class MessageTracker {
  constructor() {
    this.queues = new Map(); // chatId -> Promise (tail of the queue)
    this.pending = new Map(); // messageId -> { timestamp, promise, message }
    this.completed = new Map(); // messageId -> timestamp (for cleanup)
    this.transcriptionMessages = new Map(); // audioMessageId -> { transcriptionMessage, timestamp }
    this.cancelled = new Set(); // messageIds that should not be transcribed

    // Set up periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupTranscriptions();
    }, config.transcription.cleanupIntervalMs);
  }

  isProcessing(messageId) {
    return this.pending.has(messageId);
  }

  isCompleted(messageId) {
    return this.completed.has(messageId);
  }

  async transcribe(messageId, message, audioPath, client) {
    // Check if already processed or processing
    if (this.isCompleted(messageId)) {
      logger.debug('MessageTracker', 'Message already transcribed, skipping', { messageId });
      return;
    }

    if (this.isProcessing(messageId)) {
      logger.debug('MessageTracker', 'Message already being transcribed, skipping', { messageId });
      return;
    }

    this.pending.set(messageId, true);
    const chatId = message.fromMe ? message.to : message.from;

    // Initialize queue for this chat if it doesn't exist
    if (!this.queues.has(chatId)) {
      this.queues.set(chatId, Promise.resolve());
    }

    // Get the previous task in the queue
    const previousTask = this.queues.get(chatId);

    // Chain the new task
    const processingTask = previousTask.then(async () => {
      logger.info('MessageTracker', 'Starting transcription', { messageId });

      const entry = {
        timestamp: Date.now(),
        messageId: messageId,
        message: message
      };

      try {
        // Start transcription and store the promise
        const promise = TranscriptionService.transcribe(audioPath, messageId);
        this.pending.set(messageId, { ...entry, promise });

        // Wait for completion
        const transcriptionText = await promise;

        // Check if transcription was cancelled during processing
        if (this.cancelled.has(messageId)) {
          logger.info('MessageTracker', 'Transcription cancelled, skipping reply', { messageId });
          throw new Error('Transcription cancelled');
        }

        // Reply to the original message (solves race condition!)
        // By quoting, each transcription is tied to its source message
        // sendSeen: false keeps the chat unread and the phone notification alive,
        // and avoids sending blue ticks (read receipts) to the sender
        const replyMsg = await message.reply(
          i18n.t('transcriptionResult', transcriptionText),
          undefined,
          { sendSeen: false }
        );

        // Store transcription message for potential deletion
        this.transcriptionMessages.set(messageId, {
          transcriptionMessage: replyMsg,
          timestamp: Date.now()
        });

        // Mark as completed
        this.completed.set(messageId, Date.now());

        logger.info('MessageTracker', 'Successfully transcribed', { messageId });
      } catch (error) {
        logger.errorWithStack('MessageTracker', 'Error transcribing message', error, { messageId });

        // Try to send error message to user
        try {
          const errorDetail = error.message.includes('timeout')
            ? i18n.t('transcriptionTimeout')
            : i18n.t('transcriptionRetry');
          await message.reply(i18n.t('transcriptionFailed') + errorDetail, undefined, { sendSeen: false });
        } catch (replyError) {
          logger.error('MessageTracker', 'Failed to send error message', {
            messageId,
            error: replyError.message
          });
        }
      } finally {
        // Mark as completed and remove from pending
        this.completed.set(messageId, Date.now());
        this.pending.delete(messageId);
        // Clean up cancelled if present
        this.cancelled.delete(messageId);
      }
    });

    // Wrap with cleanup logic
    // We use a separate promise to ensure we check the map against the *stored* promise
    const currentTask = processingTask.finally(() => {
      // If this task is still the tail of the queue, remove the queue
      if (this.queues.get(chatId) === currentTask) {
        this.queues.delete(chatId);
      }
    });

    // Update the queue tail
    this.queues.set(chatId, currentTask);

    // Return the task promise so the caller can await it if needed
    return currentTask;
  }

  // Get status for debugging
  getStatus() {
    return {
      pending: this.pending.size,
      completed: this.completed.size,
      transcriptionMessages: this.transcriptionMessages.size,
      cancelled: this.cancelled.size
    };
  }


  // Clean up old transcription message mappings and completed entries
  cleanupTranscriptions() {
    const now = Date.now();
    const maxAge = config.transcription.maxAgeMs;
    let removedTranscriptions = 0;
    let removedCompleted = 0;

    for (const [audioId, entry] of this.transcriptionMessages) {
      if (now - entry.timestamp > maxAge) {
        this.transcriptionMessages.delete(audioId);
        removedTranscriptions++;
      }
    }

    for (const [messageId, timestamp] of this.completed) {
      if (now - timestamp > maxAge) {
        this.completed.delete(messageId);
        removedCompleted++;
      }
    }

    if (removedTranscriptions > 0 || removedCompleted > 0) {
      logger.info('MessageTracker', 'Cleaned up expired entries', {
        transcriptionMappings: removedTranscriptions,
        completedEntries: removedCompleted
      });
    }
  }

  // Handle message revocation
  async handleRevoke(message, client) {
    try {
      // For revoked messages, get the original message ID from protocolMessageKey
      let messageId = message.id._serialized;
      if (message.type === 'revoked' && message.rawData?.protocolMessageKey?._serialized) {
        messageId = message.rawData.protocolMessageKey._serialized;
      }

      // Check if transcription is in progress
      if (this.isProcessing(messageId)) {
        this.cancelled.add(messageId);
        return;
      }

      // Check if transcription exists and delete it
      if (this.isCompleted(messageId)) {
        const entry = this.transcriptionMessages.get(messageId);
        if (entry) {
          try {
            await entry.transcriptionMessage.delete(true); // Delete for everyone
            this.transcriptionMessages.delete(messageId);
          } catch (deleteError) {
            logger.error('MessageTracker', 'Failed to delete transcription', {
              messageId,
              error: deleteError.message
            });
            // Still remove from map even if delete failed
            this.transcriptionMessages.delete(messageId);
          }
        }
      }
    } catch (error) {
      logger.errorWithStack('MessageTracker', 'Error handling message revocation', error);
    }
  }

  // Clean up resources
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const messageTracker = new MessageTracker();
