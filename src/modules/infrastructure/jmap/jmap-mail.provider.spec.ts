import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { JmapMailProvider } from './jmap-mail.provider.js';
import { JmapService } from './jmap.service.js';
import {
  newJmapMailbox,
  newJmapEmail,
  newJmapIdentity,
  newJmapQuota,
  newSendEmailDto,
  newDraftEmailDto,
} from '../../../../test/fixtures.js';
import type { JmapResponse } from './jmap.types.js';

function jmapResponse<T>(data: T): JmapResponse {
  return {
    methodResponses: [['Method/response', data, 'r0']],
    sessionState: 'state-0',
  } as unknown as JmapResponse;
}

function jmapMultiResponse(...responses: unknown[]): JmapResponse {
  return {
    methodResponses: responses.map((data, i) => [
      'Method/response',
      data,
      `r${i}`,
    ]),
    sessionState: 'state-0',
  } as unknown as JmapResponse;
}

describe('JmapMailProvider', () => {
  let provider: JmapMailProvider;
  let jmapService: DeepMocked<JmapService>;

  const accountId = 'account-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JmapMailProvider],
    })
      .useMocker(() => createMock<JmapService>())
      .compile();

    provider = module.get<JmapMailProvider>(JmapMailProvider);
    jmapService = module.get(JmapService);

    jmapService.getPrimaryAccountId.mockResolvedValue(accountId);
  });

  describe('getMailboxes', () => {
    it('When called, then it returns mapped mailboxes', async () => {
      const jmapMailboxes = [
        newJmapMailbox({ role: 'inbox' }),
        newJmapMailbox({ role: 'sent' }),
      ];
      jmapService.request.mockResolvedValue(
        jmapResponse({ list: jmapMailboxes }),
      );

      const result = await provider.getMailboxes('user@test.com');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe(jmapMailboxes[0]!.id);
      expect(result[0]!.type).toBe('inbox');
      expect(result[1]!.type).toBe('sent');
    });
  });

  describe('listEmails', () => {
    it('when called without mailbox, then returns all email summaries', async () => {
      const jmapEmails = [newJmapEmail(), newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 42 },
          { list: jmapEmails },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
      });

      expect(result.emails).toHaveLength(2);
      expect(result.total).toBe(42);
      expect(result.emails[0]!.mailboxIds).toEqual(
        Object.keys(jmapEmails[0]!.mailboxIds),
      );
    });

    it('when called with a mailbox, then filters by that mailbox', async () => {
      const inboxMailbox = newJmapMailbox({ role: 'inbox' });
      const jmapEmails = [newJmapEmail(), newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 42 },
          { list: jmapEmails },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        mailbox: 'inbox',
        limit: 20,
        position: 0,
      });

      expect(result.emails).toHaveLength(2);
      expect(result.total).toBe(42);
    });

    it('when result count equals limit, then hasMoreMails is true with nextAnchor', async () => {
      const jmapEmails = [newJmapEmail(), newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 10 },
          { list: jmapEmails },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        limit: 2,
        position: 0,
      });

      expect(result.hasMoreMails).toBe(true);
      expect(result.nextAnchor).toBe(jmapEmails[1]!.id);
    });

    it('when result count is less than limit, then hasMoreMails is false', async () => {
      const jmapEmails = [newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 1 },
          { list: jmapEmails },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
      });

      expect(result.hasMoreMails).toBe(false);
      expect(result.nextAnchor).toBeUndefined();
    });
  });

  describe('getEmail', () => {
    it('When email exists, then it returns the mapped email detail', async () => {
      const jmapEmail = newJmapEmail();
      jmapService.request.mockResolvedValue(
        jmapResponse({ list: [jmapEmail] }),
      );

      const result = await provider.getEmail('user@test.com', jmapEmail.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(jmapEmail.id);
    });

    it('When email does not exist, then it returns null', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({ list: [] }));

      const result = await provider.getEmail('user@test.com', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getTextBodies', () => {
    it('When ids are empty, then it returns an empty map without requesting', async () => {
      const result = await provider.getTextBodies('user@test.com', []);

      expect(result.size).toBe(0);
      expect(jmapService.request).not.toHaveBeenCalled();
    });

    it('When ids are given, then it maps each id to its text body value', async () => {
      const email = newJmapEmail();
      const partId = email.textBody![0]!.partId!;
      const expectedBody = email.bodyValues![partId]!.value;
      jmapService.request.mockResolvedValue(jmapResponse({ list: [email] }));

      const result = await provider.getTextBodies('user@test.com', [email.id]);

      expect(result.get(email.id)).toBe(expectedBody);
    });

    it('When an email has no text part, then its value is null', async () => {
      const email = newJmapEmail({ textBody: [], bodyValues: {} });
      jmapService.request.mockResolvedValue(jmapResponse({ list: [email] }));

      const result = await provider.getTextBodies('user@test.com', [email.id]);

      expect(result.get(email.id)).toBeNull();
    });
  });

  describe('sendEmail', () => {
    it('When email is created and submitted, then it returns the created id', async () => {
      const sentMailbox = newJmapMailbox({ role: 'sent' });
      const identity = newJmapIdentity();

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [sentMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { created: { draft: { id: 'created-email-id' } } },
          { created: { submission: { id: 'sub-id' } } },
        ),
      );

      const dto = newSendEmailDto();
      const result = await provider.sendEmail('user@test.com', dto);

      expect(result).toEqual({ id: 'created-email-id' });
    });

    it('When email creation fails, then it throws', async () => {
      const sentMailbox = newJmapMailbox({ role: 'sent' });
      const identity = newJmapIdentity();

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [sentMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse({ created: null }, { created: null }),
      );

      const dto = newSendEmailDto();

      await expect(provider.sendEmail('user@test.com', dto)).rejects.toThrow(
        'Failed to create email for sending',
      );
    });
  });

  describe('saveDraft', () => {
    it('When draft is saved, then it returns the created id', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: { draft: { id: 'draft-id' } } }),
      );

      const dto = newDraftEmailDto();
      const result = await provider.saveDraft('user@test.com', dto);

      expect(result).toEqual({ id: 'draft-id' });
    });

    it('When draft creation fails, then it throws', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: null }),
      );

      const dto = newDraftEmailDto();

      await expect(provider.saveDraft('user@test.com', dto)).rejects.toThrow(
        'Failed to save draft',
      );
    });
  });

  describe('moveEmail', () => {
    it('When called, then it sends an Email/set update with new mailboxIds', async () => {
      const trashMailbox = newJmapMailbox({ role: 'trash' });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [trashMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(jmapResponse({}));

      await provider.moveEmail('user@test.com', 'email-1', 'trash');

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      const update = methodArgs['update'] as Record<string, unknown>;
      expect(update['email-1']).toEqual({
        mailboxIds: { [trashMailbox.id]: true },
      });
    });
  });

  describe('deleteEmail', () => {
    it('When email is in trash, then it permanently destroys it', async () => {
      const trashMailbox = newJmapMailbox({ role: 'trash' });
      const emailInTrash = newJmapEmail({
        mailboxIds: { [trashMailbox.id]: true },
      });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [emailInTrash] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [trashMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(jmapResponse({}));

      await provider.deleteEmail('user@test.com', emailInTrash.id);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      expect(methodArgs['destroy']).toEqual([emailInTrash.id]);
    });

    it('When email is not in trash, then it moves it to trash', async () => {
      const trashMailbox = newJmapMailbox({ role: 'trash' });
      const emailNotInTrash = newJmapEmail({
        mailboxIds: { 'other-mailbox': true },
      });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [emailNotInTrash] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [trashMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(jmapResponse({}));

      await provider.deleteEmail('user@test.com', emailNotInTrash.id);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      const update = methodArgs['update'] as Record<string, unknown>;
      expect(update[emailNotInTrash.id]).toEqual({
        mailboxIds: { [trashMailbox.id]: true },
      });
    });

    it('When email does not exist, then it returns without error', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({ list: [] }));

      await expect(
        provider.deleteEmail('user@test.com', 'nonexistent'),
      ).resolves.toBeUndefined();
    });
  });

  describe('markAsRead', () => {
    it('When called with true, then it sets the $seen keyword', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({}));

      await provider.markAsRead('user@test.com', 'email-1', true);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      const update = methodArgs['update'] as Record<string, unknown>;
      expect(update['email-1']).toEqual({ 'keywords/$seen': true });
    });

    it('When called with false, then it clears the $seen keyword', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({}));

      await provider.markAsRead('user@test.com', 'email-1', false);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      const update = methodArgs['update'] as Record<string, unknown>;
      expect(update['email-1']).toEqual({ 'keywords/$seen': null });
    });
  });

  describe('search', () => {
    it('when called with text filter, then it passes it to jmap', async () => {
      const jmapEmails = [newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 1 },
          { list: jmapEmails },
        ),
      );

      await provider.search({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
        filter: { text: 'hello' },
      });

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = lastCall[1][0]![1];
      expect(queryArgs['filter']).toMatchObject({ text: 'hello*' });
    });

    it('when called with from and to filters, then the mails are filtered by from', async () => {
      const jmapEmails = [newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 1 },
          { list: jmapEmails },
        ),
      );

      await provider.search({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
        filter: {
          text: 'hello',
          from: ['alice@example.com'],
          to: ['bob@example.com'],
        },
      });

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = lastCall[1][0]![1];
      expect(queryArgs['filter']).toMatchObject({
        from: 'alice@example.com',
        to: 'bob@example.com',
      });
    });

    it('when called with after and before filters, then the mails are filtered by to', async () => {
      const jmapEmails = [newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 1 },
          { list: jmapEmails },
        ),
      );

      await provider.search({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
        filter: {
          text: 'hello',
          after: '2024-01-01T00:00:00Z',
          before: '2024-12-31T23:59:59Z',
        },
      });

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = lastCall[1][0]![1];
      expect(queryArgs['filter']).toMatchObject({
        after: '2024-01-01T00:00:00Z',
        before: '2024-12-31T23:59:59Z',
      });
    });

    it('when filtering by mails that has not been read, then the mails are filtered by checking that are not seen ($seen keyword)', async () => {
      const jmapEmails = [newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 1 },
          { list: jmapEmails },
        ),
      );

      await provider.search({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
        filter: { text: 'hello', unread: true },
      });

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = lastCall[1][0]![1];
      expect(queryArgs['filter']).toMatchObject({ notKeyword: '$seen' });
      expect(queryArgs['filter']).not.toHaveProperty('unread');
    });

    it('when filtering by emails that has attachments, then the mails are filtered by attachments', async () => {
      const jmapEmails = [newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: jmapEmails.map((e) => e.id), total: 1 },
          { list: jmapEmails },
        ),
      );

      await provider.search({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
        filter: { text: 'hello', hasAttachment: true },
      });

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = lastCall[1][0]![1];
      expect(queryArgs['filter']).toMatchObject({ hasAttachment: true });
    });
  });

  describe('markAsFlagged', () => {
    it('When called with true, then it sets the $flagged keyword', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({}));

      await provider.markAsFlagged('user@test.com', 'email-1', true);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      const update = methodArgs['update'] as Record<string, unknown>;
      expect(update['email-1']).toEqual({ 'keywords/$flagged': true });
    });
  });

  describe('Uploading an attachment', () => {
    it('when a user uploads an attachment, then the file is forwarded for storage and the stored details are returned', async () => {
      const payload = {
        userEmail: 'user@test.com',
        blob: {
          name: 'image.jpg',
          buffer: Buffer.from('binary'),
          mimeType: 'image/jpeg',
        },
      };
      const storedBlob = {
        accountId: 'acc-1',
        blobId: 'blob-1',
        size: 6,
        type: 'image/jpeg',
      };
      jmapService.uploadAttachment.mockResolvedValue(storedBlob);

      const result = await provider.uploadAttachment(payload);

      expect(jmapService.uploadAttachment).toHaveBeenCalledWith(payload);
      expect(result).toBe(storedBlob);
    });
  });

  describe('Downloading an attachment', () => {
    it('when a user downloads an attachment, then the request is forwarded and the stored bytes are returned', async () => {
      const payload = {
        userEmail: 'user@test.com',
        blobId: 'blob-1',
        name: 'photo.jpg',
        type: 'image/jpeg',
      };
      const stored = {
        stream: Readable.from(Buffer.from('binary')),
        contentType: 'image/jpeg',
        contentLength: 1234,
      };
      jmapService.downloadAttachment.mockResolvedValue(stored);

      const result = await provider.downloadAttachment(payload);

      expect(jmapService.downloadAttachment).toHaveBeenCalledWith(payload);
      expect(result).toBe(stored);
    });
  });

  describe('getQuota', () => {
    it('when quota exists, then returns used and limit from octets quota', async () => {
      const quota = newJmapQuota({ used: 500_000, hardLimit: 1_000_000 });
      jmapService.request.mockResolvedValue(jmapResponse({ list: [quota] }));

      const result = await provider.getQuota('user@test.com');

      expect(result).toEqual({ used: 500_000, limit: 1_000_000 });
    });

    it('when no octets quota exists, then returns zeros', async () => {
      const nonOctetsQuota = newJmapQuota({ resourceType: 'count' });
      jmapService.request.mockResolvedValue(
        jmapResponse({ list: [nonOctetsQuota] }),
      );

      const result = await provider.getQuota('user@test.com');

      expect(result).toEqual({ used: 0, limit: 0 });
    });

    it('when quota list is empty, then returns zeros', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({ list: [] }));

      const result = await provider.getQuota('user@test.com');

      expect(result).toEqual({ used: 0, limit: 0 });
    });
  });
});
