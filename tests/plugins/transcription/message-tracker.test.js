import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { MessageTracker } from '../../../src/plugins/transcription/message-tracker.js';
import { TranscriptionService } from '../../../src/plugins/transcription/transcription-service.js';

describe('MessageTracker', () => {
  let tracker;
  const mockMessage = {
    from: 'chat1',
    to: 'me',
    fromMe: false,
    id: { _serialized: 'msg123' },
    reply: mock.fn()
  };

  beforeEach(() => {
    tracker = new MessageTracker();
    // Mock TranscriptionService.transcribe to avoid actual API calls
    mock.method(TranscriptionService, 'transcribe', async () => 'Transcribed text');
    mockMessage.reply.mock.resetCalls();
  });

  afterEach(() => {
    tracker.destroy();
    mock.restoreAll();
  });

  describe('isProcessing', () => {
    it('should return false for untracked message', () => {
      assert.strictEqual(tracker.isProcessing('msg123'), false);
    });

    it('should return true for message being processed', () => {
      // Add a pending entry
      tracker.pending.set('msg123', {
        timestamp: Date.now(),
        messageId: 'msg123',
        promise: Promise.resolve()
      });
      assert.strictEqual(tracker.isProcessing('msg123'), true);
    });
  });

  describe('isCompleted', () => {
    it('should return false for message not completed', () => {
      assert.strictEqual(tracker.isCompleted('msg123'), false);
    });

    it('should return true for completed message', () => {
      tracker.completed.set('msg123', Date.now());
      assert.strictEqual(tracker.isCompleted('msg123'), true);
    });
  });

  describe('transcribe', () => {
    it('should skip already completed messages', async () => {
      tracker.completed.set('msg123', Date.now());

      await tracker.transcribe('msg123', mockMessage, '/path/to/audio.ogg');

      // Should not be in pending, and nothing should have been transcribed or replied
      assert.strictEqual(tracker.pending.has('msg123'), false);
      assert.strictEqual(TranscriptionService.transcribe.mock.callCount(), 0);
      assert.strictEqual(mockMessage.reply.mock.callCount(), 0);
    });

    it('should skip messages already being processed', async () => {
      // Simulate ongoing processing
      tracker.pending.set('msg123', {
        timestamp: Date.now(),
        messageId: 'msg123',
        promise: new Promise(() => { }) // Never resolves
      });

      const pendingSizeBefore = tracker.pending.size;

      await tracker.transcribe('msg123', {}, '/path/to/audio.ogg');

      // Should not add another pending entry
      assert.strictEqual(tracker.pending.size, pendingSizeBefore);
    });

    it('should queue messages for the same chat', async () => {
      const msg1 = { ...mockMessage, id: { _serialized: 'msg1' } };
      const msg2 = { ...mockMessage, id: { _serialized: 'msg2' } };

      // Start first transcription
      const p1 = tracker.transcribe('msg1', msg1, 'path1');
      assert.strictEqual(tracker.isProcessing('msg1'), true);

      // Start second transcription
      const p2 = tracker.transcribe('msg2', msg2, 'path2');
      assert.strictEqual(tracker.isProcessing('msg2'), true);

      await Promise.all([p1, p2]);

      assert.strictEqual(tracker.isCompleted('msg1'), true);
      assert.strictEqual(tracker.isCompleted('msg2'), true);
    });

    it('should reply to the original message with sendSeen: false', async () => {
      await tracker.transcribe('msg123', mockMessage, '/path/to/audio.ogg');

      assert.strictEqual(mockMessage.reply.mock.callCount(), 1);
      const args = mockMessage.reply.mock.calls[0].arguments;
      assert.strictEqual(args[1], undefined);
      assert.deepStrictEqual(args[2], { sendSeen: false });
      assert.strictEqual(tracker.isCompleted('msg123'), true);
    });

    it('should use separate queues for outgoing messages to different chats', async () => {
      const msg1 = { ...mockMessage, fromMe: true, from: 'me', to: 'chat1', id: { _serialized: 'msg1' } };
      const msg2 = { ...mockMessage, fromMe: true, from: 'me', to: 'chat2', id: { _serialized: 'msg2' } };
      
      const p1 = tracker.transcribe('msg1', msg1, 'path1');
      const p2 = tracker.transcribe('msg2', msg2, 'path2');

      // Queues are keyed by the destination chat (message.to) for outgoing messages
      assert.strictEqual(tracker.queues.size, 2);
      assert.ok(tracker.queues.has('chat1'));
      assert.ok(tracker.queues.has('chat2'));

      await Promise.all([p1, p2]);

      // Queues are removed once drained
      assert.strictEqual(tracker.queues.size, 0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      tracker.pending.set('msg1', { timestamp: Date.now() });
      tracker.pending.set('msg2', { timestamp: Date.now() });
      tracker.completed.set('msg3', Date.now());
      tracker.completed.set('msg4', Date.now());
      tracker.completed.set('msg5', Date.now());
      tracker.transcriptionMessages.set('msg3', { transcriptionMessage: {}, timestamp: Date.now() });
      tracker.cancelled.add('msg1');

      const status = tracker.getStatus();

      assert.strictEqual(status.pending, 2);
      assert.strictEqual(status.completed, 3);
      assert.strictEqual(status.transcriptionMessages, 1);
      assert.strictEqual(status.cancelled, 1);
    });

    it('should return zeros when empty', () => {
      const status = tracker.getStatus();

      assert.strictEqual(status.pending, 0);
      assert.strictEqual(status.completed, 0);
      assert.strictEqual(status.transcriptionMessages, 0);
      assert.strictEqual(status.cancelled, 0);
    });
  });

  describe('race condition handling', () => {
    it('should handle multiple simultaneous transcriptions', async () => {
      const durations = { msg1: 30, msg2: 5, msg3: 15 };
      const finished = [];

      TranscriptionService.transcribe.mock.mockImplementation(async (audioPath, messageId) => {
        await new Promise(resolve => setTimeout(resolve, durations[messageId]));
        finished.push(messageId);
        return `Text for ${messageId}`;
      });

      // Different chats, so they run concurrently and finish out of order
      const tasks = Object.keys(durations).map((id, i) => {
        const msg = { ...mockMessage, from: `chat${i}`, id: { _serialized: id }, reply: mock.fn() };
        return tracker.transcribe(id, msg, `path-${id}`);
      });

      await Promise.all(tasks);

      assert.deepStrictEqual(finished, ['msg2', 'msg3', 'msg1']);
      for (const id of Object.keys(durations)) {
        assert.ok(tracker.isCompleted(id));
        assert.strictEqual(tracker.isProcessing(id), false);
      }
      assert.strictEqual(tracker.completed.size, 3);
      assert.strictEqual(tracker.queues.size, 0);
    });
  });
});
