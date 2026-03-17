import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { JmapMailProvider } from './jmap-mail.provider.js';
import { JmapService } from './jmap.service.js';
import {
  newJmapMailbox,
  newJmapEmail,
  newJmapIdentity,
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
    it('When called, then it returns email summaries and total count', async () => {
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

      const result = await provider.listEmails('user@test.com', 'inbox', 20, 0);

      expect(result.emails).toHaveLength(2);
      expect(result.total).toBe(42);
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
});
