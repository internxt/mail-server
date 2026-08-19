import { describe, it, test, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { JmapMailProvider } from './jmap-mail.provider.js';
import {
  JMAP_QUOTA_CAPABILITIES,
  JmapError,
  JmapService,
} from './jmap.service.js';
import {
  DraftUpdateConflictError,
  MissingMessageIdError,
} from '../../email/mail-provider.port.js';
import {
  newJmapMailbox,
  newJmapEmail,
  newJmapIdentity,
  newJmapQuota,
  newJmapSession,
  newSendEmailDto,
  newDraftEmailDto,
  newThreadingHeaders,
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
  const session = newJmapSession({
    primaryAccounts: { 'urn:ietf:params:jmap:mail': accountId },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JmapMailProvider],
    })
      .useMocker(() => createMock<JmapService>())
      .compile();

    provider = module.get<JmapMailProvider>(JmapMailProvider);
    jmapService = module.get(JmapService);

    jmapService.getSession.mockResolvedValue(session);
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
    test('When listing without a mailbox filter, then the list collapses by thread and threads are enriched with size, lastReceivedAt and participants', async () => {
      const aliceEmail = 'alice@example.com';
      const bobEmail = 'bob@example.com';
      const rep = newJmapEmail({
        threadId: 'thread-1',
        from: [{ name: 'Alice', email: aliceEmail }],
        receivedAt: '2026-06-15T10:00:00Z',
      });
      const reply = newJmapEmail({
        threadId: 'thread-1',
        from: [{ name: 'Bob', email: bobEmail }],
        receivedAt: '2026-06-15T11:00:00Z',
      });
      const earlier = newJmapEmail({
        threadId: 'thread-1',
        from: [{ name: 'Alice', email: aliceEmail }],
        receivedAt: '2026-06-15T09:00:00Z',
      });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: [rep.id], total: 1 },
          { list: [rep] },
          {
            list: [
              { id: 'thread-1', emailIds: [earlier.id, rep.id, reply.id] },
            ],
          },
          { list: [earlier, rep, reply] },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
      });

      expect(result.emails).toHaveLength(1);
      expect(result.emails[0]!.threadSize).toBe(3);
      expect(result.emails[0]!.lastReceivedAt).toBe('2026-06-15T11:00:00Z');
      expect(result.emails[0]!.participants).toEqual([
        { name: 'Alice', email: aliceEmail },
        { name: 'Bob', email: bobEmail },
      ]);
    });

    test('When listing an inbox, then Email/query is sent with collapseThreads and the inMailbox filter', async () => {
      const inboxMailbox = newJmapMailbox({ role: 'inbox' });
      const rep = newJmapEmail({ threadId: 'thread-1' });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: [rep.id], total: 1 },
          { list: [rep] },
          { list: [{ id: 'thread-1', emailIds: [rep.id] }] },
          { list: [rep] },
        ),
      );

      await provider.listEmails({
        userEmail: 'user@test.com',
        mailbox: 'inbox',
        limit: 20,
        position: 0,
      });

      const queryCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = queryCall[1][0]![1];
      expect(queryArgs['collapseThreads']).toBe(true);
      expect(queryArgs['filter']).toEqual({ inMailbox: inboxMailbox.id });
    });

    test('When listing drafts, then collapseThreads is not sent and each draft is returned individually', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const drafts = [newJmapEmail(), newJmapEmail()];

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: drafts.map((e) => e.id), total: 2 },
          { list: drafts },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        mailbox: 'drafts',
        limit: 20,
        position: 0,
      });

      const queryCall = jmapService.request.mock.calls.at(-1)!;
      const queryArgs = queryCall[1][0]![1];
      expect(queryArgs['collapseThreads']).toBeUndefined();
      expect(result.emails).toHaveLength(2);
      expect(result.emails[0]!.threadSize).toBeUndefined();
      expect(result.emails[0]!.participants).toBeUndefined();
    });

    test('When the same sender appears in multiple emails of the thread, then participants are deduplicated by email (case-insensitive)', async () => {
      const rep = newJmapEmail({
        threadId: 'thread-1',
        from: [{ name: 'Alice', email: 'ALICE@example.com' }],
        receivedAt: '2026-06-15T10:00:00Z',
      });
      const dupAlice = newJmapEmail({
        threadId: 'thread-1',
        from: [{ name: 'Alice', email: 'alice@example.com' }],
        receivedAt: '2026-06-15T11:00:00Z',
      });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: [rep.id], total: 1 },
          { list: [rep] },
          { list: [{ id: 'thread-1', emailIds: [rep.id, dupAlice.id] }] },
          { list: [rep, dupAlice] },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        limit: 20,
        position: 0,
      });

      expect(result.emails[0]!.participants).toHaveLength(1);
      expect(result.emails[0]!.participants![0]!.email).toBe(
        'ALICE@example.com',
      );
    });

    test('When the result count equals the requested limit, then the caller is told there are more threads and gets the next anchor', async () => {
      const reps = [
        newJmapEmail({ threadId: 't-1' }),
        newJmapEmail({ threadId: 't-2' }),
      ];

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: reps.map((e) => e.id), total: 10 },
          { list: reps },
          {
            list: reps.map((r) => ({ id: r.threadId, emailIds: [r.id] })),
          },
          { list: reps },
        ),
      );

      const result = await provider.listEmails({
        userEmail: 'user@test.com',
        limit: 2,
        position: 0,
      });

      expect(result.hasMoreMails).toBe(true);
      expect(result.nextAnchor).toBe(reps[1]!.id);
    });

    test('When the result count is less than the requested limit, then the caller is told there are no more threads', async () => {
      const rep = newJmapEmail({ threadId: 't-1' });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: [rep.id], total: 1 },
          { list: [rep] },
          { list: [{ id: 't-1', emailIds: [rep.id] }] },
          { list: [rep] },
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

      expect(result).toEqual({
        id: 'created-email-id',
        deletedEntryKey: null,
      });
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

    test('When sending from an existing draft, then the new email is created with the latest content and the previous draft is removed in the same operation', async () => {
      const sentMailbox = newJmapMailbox({ role: 'sent' });
      const identity = newJmapIdentity();
      jmapService.getPrimaryAccountId.mockResolvedValue('b');

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [sentMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { created: { draft: { id: 'sent-email-id' } } },
          { created: { submission: { id: 'sub-id' } } },
        ),
      );

      const dto = newSendEmailDto({ draftId: 'c' });
      const result = await provider.sendEmail('user@test.com', dto);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const [emailSetName, emailSetArgs] = lastCall[1][0]!;
      expect(emailSetName).toBe('Email/set');
      expect(emailSetArgs['destroy']).toEqual(['c']);
      expect(emailSetArgs['create']).toBeDefined();
      expect(result).toEqual({
        id: 'sent-email-id',
        deletedEntryKey: '1:2',
      });
    });

    test('When the draft could not be destroyed while sending, then no quota entry key is returned so its usage is not released', async () => {
      const sentMailbox = newJmapMailbox({ role: 'sent' });
      const identity = newJmapIdentity();
      jmapService.getPrimaryAccountId.mockResolvedValue('b');

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [sentMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          {
            created: { draft: { id: 'sent-email-id' } },
            notDestroyed: { c: { type: 'notFound' } },
          },
          { created: { submission: { id: 'sub-id' } } },
        ),
      );

      const result = await provider.sendEmail(
        'user@test.com',
        newSendEmailDto({ draftId: 'c' }),
      );

      expect(result).toEqual({
        id: 'sent-email-id',
        deletedEntryKey: null,
      });
    });

    test('When email creation fails after the draft was destroyed, then it throws carrying the deleted entry key so its usage can still be released', async () => {
      const sentMailbox = newJmapMailbox({ role: 'sent' });
      const identity = newJmapIdentity();
      jmapService.getPrimaryAccountId.mockResolvedValue('b');

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [sentMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse({ created: null }, { created: null }),
      );

      const dto = newSendEmailDto({ draftId: 'c' });

      await expect(
        provider.sendEmail('user@test.com', dto),
      ).rejects.toMatchObject({
        name: 'SendEmailFailedError',
        deletedEntryKey: '1:2',
      });
    });

    test('When sending without a draftId, then the Email/set call does not include any destroy operation', async () => {
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
          { created: { draft: { id: 'sent-email-id' } } },
          { created: { submission: { id: 'sub-id' } } },
        ),
      );

      await provider.sendEmail('user@test.com', newSendEmailDto());

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const [, emailSetArgs] = lastCall[1][0]!;
      expect(emailSetArgs['destroy']).toBeUndefined();
    });
  });

  describe('saveDraft', () => {
    test('When the draft is saved, then the full draft email is returned to the caller', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();
      const savedDraft = newJmapEmail({ keywords: { $draft: true } });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: { draft: { id: savedDraft.id } } }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [savedDraft] }),
      );

      const dto = newDraftEmailDto();
      const result = await provider.saveDraft('user@test.com', dto);

      expect(result.id).toBe(savedDraft.id);
    });

    test('When the server does not confirm the draft creation, then the caller is told the save failed', async () => {
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

    test('When the server confirms the creation but the fetch returns no email, then the caller is told the fetch failed', async () => {
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
      jmapService.request.mockResolvedValueOnce(jmapResponse({ list: [] }));

      await expect(
        provider.saveDraft('user@test.com', newDraftEmailDto()),
      ).rejects.toThrow('Failed to fetch the created draft');
    });
  });

  describe('Update Draft', () => {
    test('When trying to update a draft that does not exist, then null is returned', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(jmapResponse({ list: [] }));

      const result = await provider.updateDraft(
        'user@test.com',
        'missing-draft',
        newDraftEmailDto(),
      );

      expect(result).toBeNull();
    });

    test('When the draft is updated, then the new draft is returned and the destroyed one comes back as a quota entry key', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();
      const existingDraft = newJmapEmail({
        id: 'c',
        keywords: { $draft: true },
      });
      const updatedDraft = newJmapEmail({
        id: 'd',
        keywords: { $draft: true },
      });
      jmapService.getPrimaryAccountId.mockResolvedValue('b');

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [existingDraft] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: { draft: { id: updatedDraft.id } } }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [updatedDraft] }),
      );

      const result = await provider.updateDraft(
        'user@test.com',
        existingDraft.id,
        newDraftEmailDto(),
      );

      expect(result).not.toBeNull();
      expect(result!.draft.id).toBe(updatedDraft.id);
      expect(result!.deletedEntryKey).toBe('1:2');
    });

    test('When the draft is updated, then the destroy+create is guarded with ifInState from the prior read', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();
      const existingDraft = newJmapEmail({ keywords: { $draft: true } });
      const updatedDraft = newJmapEmail({ keywords: { $draft: true } });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [existingDraft], state: 'email-state-1' }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: { draft: { id: updatedDraft.id } } }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [updatedDraft] }),
      );

      await provider.updateDraft(
        'user@test.com',
        existingDraft.id,
        newDraftEmailDto(),
      );

      const setCall = jmapService.request.mock.calls.find(
        (call) => call[1][0]![0] === 'Email/set',
      )!;
      const [, setArgs] = setCall[1][0]!;
      expect(setArgs['ifInState']).toBe('email-state-1');
      expect(setArgs['destroy']).toEqual([existingDraft.id]);
    });

    test('When the account state changes between the read and the write, then the update is retried and succeeds', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();
      const existingDraft = newJmapEmail({ keywords: { $draft: true } });
      const updatedDraft = newJmapEmail({ keywords: { $draft: true } });
      const stateMismatch = new JmapError('JMAP method error', [
        ['error', { type: 'stateMismatch' }, 'r0'],
      ]);

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [existingDraft], state: 'email-state-1' }),
      );
      jmapService.request.mockRejectedValueOnce(stateMismatch);
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [existingDraft], state: 'email-state-2' }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: { draft: { id: updatedDraft.id } } }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [updatedDraft] }),
      );

      const result = await provider.updateDraft(
        'user@test.com',
        existingDraft.id,
        newDraftEmailDto(),
      );

      expect(result!.draft.id).toBe(updatedDraft.id);
      const setCalls = jmapService.request.mock.calls.filter(
        (call) => call[1][0]![0] === 'Email/set',
      );
      expect(setCalls).toHaveLength(2);
      expect(setCalls[1]![1][0]![1]['ifInState']).toBe('email-state-2');
    });

    test('When the update keeps losing the state race, then a conflict error is surfaced', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();
      const existingDraft = newJmapEmail({ keywords: { $draft: true } });
      const stateMismatch = new JmapError('JMAP method error', [
        ['error', { type: 'stateMismatch' }, 'r0'],
      ]);

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      for (let i = 0; i < 3; i++) {
        jmapService.request.mockResolvedValueOnce(
          jmapResponse({ list: [existingDraft], state: `email-state-${i}` }),
        );
        jmapService.request.mockRejectedValueOnce(stateMismatch);
      }

      await expect(
        provider.updateDraft(
          'user@test.com',
          existingDraft.id,
          newDraftEmailDto(),
        ),
      ).rejects.toThrow(DraftUpdateConflictError);
    });

    test('When the old draft cannot be destroyed but the copy was created, then the copy is cleaned up and the update fails', async () => {
      const draftsMailbox = newJmapMailbox({ role: 'drafts' });
      const identity = newJmapIdentity();
      const existingDraft = newJmapEmail({ keywords: { $draft: true } });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [draftsMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [existingDraft], state: 'email-state-1' }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({
          created: { draft: { id: 'orphan-copy' } },
          notDestroyed: {
            [existingDraft.id]: { type: 'notFound', description: 'gone' },
          },
        }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ destroyed: ['orphan-copy'] }),
      );

      await expect(
        provider.updateDraft(
          'user@test.com',
          existingDraft.id,
          newDraftEmailDto(),
        ),
      ).rejects.toThrow('Failed to update draft: gone');

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const [methodName, methodArgs] = lastCall[1][0]!;
      expect(methodName).toBe('Email/set');
      expect(methodArgs['destroy']).toEqual(['orphan-copy']);
    });
  });

  describe('Discarding Draft', () => {
    test('When discarding a draft, then the draft is removed from the user mailbox and its quota entry key is returned', async () => {
      jmapService.getPrimaryAccountId.mockResolvedValue('b');
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ destroyed: ['c'] }),
      );

      const result = await provider.discardDraft('user@test.com', 'c');

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const [methodName, methodArgs] = lastCall[1][0]!;
      expect(methodName).toBe('Email/set');
      expect(methodArgs['destroy']).toEqual(['c']);
      expect(result).toEqual({ deletedEntryKey: '1:2' });
    });

    test('When the discarded draft id cannot be decoded, then no quota entry key is returned instead of failing the discard', async () => {
      jmapService.getPrimaryAccountId.mockResolvedValue('account-123');
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ destroyed: ['draft-1'] }),
      );

      await expect(
        provider.discardDraft('user@test.com', 'draft-1'),
      ).resolves.toEqual({ deletedEntryKey: null });
    });

    test('When the draft cannot be removed, then the user gets an error describing the reason', async () => {
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({
          notDestroyed: {
            'draft-1': { type: 'forbidden', description: 'cannot destroy' },
          },
        }),
      );

      await expect(
        provider.discardDraft('user@test.com', 'draft-1'),
      ).rejects.toThrow('Failed to discard draft draft-1: cannot destroy');
    });

    test('When the failure has no description, then the user still gets an error identifying the failure type', async () => {
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({
          notDestroyed: { 'draft-1': { type: 'notFound' } },
        }),
      );

      await expect(
        provider.discardDraft('user@test.com', 'draft-1'),
      ).rejects.toThrow('Failed to discard draft draft-1: notFound');
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
    it('When email is in trash, then it permanently destroys it and returns the quota entry key', async () => {
      const trashMailbox = newJmapMailbox({ role: 'trash' });
      const emailInTrash = newJmapEmail({
        id: 'c',
        mailboxIds: { [trashMailbox.id]: true },
      });
      jmapService.getPrimaryAccountId.mockResolvedValue('b');

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [emailInTrash] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [trashMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(jmapResponse({}));

      const result = await provider.deleteEmail(
        'user@test.com',
        emailInTrash.id,
      );

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      expect(methodArgs['destroy']).toEqual([emailInTrash.id]);
      expect(result).toEqual({ deletedEntryKey: '1:2' });
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

      const result = await provider.deleteEmail(
        'user@test.com',
        emailNotInTrash.id,
      );

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodArgs = lastCall[1][0]![1];
      const update = methodArgs['update'] as Record<string, unknown>;
      expect(update[emailNotInTrash.id]).toEqual({
        mailboxIds: { [trashMailbox.id]: true },
      });
      expect(result).toEqual({ deletedEntryKey: null });
    });

    it('When email does not exist, then it returns without a quota entry key', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({ list: [] }));

      await expect(
        provider.deleteEmail('user@test.com', 'nonexistent'),
      ).resolves.toEqual({ deletedEntryKey: null });
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

  describe('getThreadingHeaders', () => {
    it('when looking up a parent email that exists, then it returns the parent message id together with the full chain of references and the parent addresses', async () => {
      const from = [{ email: 'sender@example.com' }];
      const to = [{ email: 'me@example.com' }, { email: 'other@example.com' }];
      const cc = [{ email: 'cc@example.com' }];
      const parent = newJmapEmail({
        messageId: ['<parent@example.com>'],
        inReplyTo: ['<grandparent@example.com>'],
        references: ['<root@example.com>', '<grandparent@example.com>'],
        subject: 'Weekly sync notes',
        from,
        replyTo: [],
        to,
        cc,
      });
      jmapService.request.mockResolvedValue(jmapResponse({ list: [parent] }));

      const result = await provider.getThreadingHeaders(
        'user@test.com',
        parent.id,
      );

      expect(result).toEqual({
        messageId: ['<parent@example.com>'],
        references: [
          '<root@example.com>',
          '<grandparent@example.com>',
          '<parent@example.com>',
        ],
        parentSubject: 'Weekly sync notes',
        parentFrom: from,
        parentReplyTo: [],
        parentTo: to,
        parentCc: cc,
      });
    });

    it('when looking up a parent email that does not exist, then it returns null so the caller can decide what to do', async () => {
      jmapService.request.mockResolvedValue(jmapResponse({ list: [] }));

      const result = await provider.getThreadingHeaders(
        'user@test.com',
        'missing-id',
      );

      expect(result).toBeNull();
    });

    it('when the parent email has no message id, then an error indicating so is thrown', async () => {
      const parent = newJmapEmail({ messageId: null });
      jmapService.request.mockResolvedValue(jmapResponse({ list: [parent] }));

      await expect(
        provider.getThreadingHeaders('user@test.com', parent.id),
      ).rejects.toBeInstanceOf(MissingMessageIdError);
    });

    it('when the parent email already contains its own id in its references, then duplicates are removed from the resulting reference chain', async () => {
      const parent = newJmapEmail({
        messageId: ['<parent@example.com>'],
        inReplyTo: ['<parent@example.com>'],
        references: ['<parent@example.com>', '<root@example.com>'],
      });
      jmapService.request.mockResolvedValue(jmapResponse({ list: [parent] }));

      const result = await provider.getThreadingHeaders(
        'user@test.com',
        parent.id,
      );

      expect(result?.references).toEqual([
        '<parent@example.com>',
        '<root@example.com>',
      ]);
    });
  });

  describe('sendEmail (with threading)', () => {
    it('when sending a reply, then the threading headers are forwarded to the underlying email creation', async () => {
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
          { created: { draft: { id: 'reply-id' } } },
          { created: { submission: { id: 'sub-id' } } },
        ),
      );

      const dto = newSendEmailDto();
      const threading = newThreadingHeaders({
        references: ['<parent@example.com>'],
      });

      await provider.sendEmail('user@test.com', dto, threading);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodCalls = lastCall[1] as unknown[][];
      const emailSetArgs = methodCalls[0]![1] as {
        create: { draft: { inReplyTo: string[]; references: string[] } };
      };
      expect(emailSetArgs.create.draft.inReplyTo).toEqual([
        '<parent@example.com>',
      ]);
      expect(emailSetArgs.create.draft.references).toEqual([
        '<parent@example.com>',
      ]);
    });
  });

  describe('saveToSent (with threading)', () => {
    it('when archiving a sent reply, then the threading headers are stored alongside the message', async () => {
      const sentMailbox = newJmapMailbox({ role: 'sent' });
      const identity = newJmapIdentity();
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [identity] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [sentMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ created: { sent: { id: 'sent-id' } } }),
      );

      const dto = newSendEmailDto();
      const threading = newThreadingHeaders();

      await provider.saveToSent('user@test.com', dto, threading);

      const lastCall = jmapService.request.mock.calls.at(-1)!;
      const methodCalls = lastCall[1] as unknown[][];
      const emailSetArgs = methodCalls[0]![1] as {
        create: { sent: { inReplyTo: string[]; references: string[] } };
      };
      expect(emailSetArgs.create.sent.inReplyTo).toEqual([
        '<parent@example.com>',
      ]);
      expect(emailSetArgs.create.sent.references).toEqual([
        '<root@example.com>',
        '<parent@example.com>',
      ]);
    });
  });

  describe('getThread', () => {
    const inboxId = 'inbox-mailbox';
    const sentId = 'sent-mailbox';
    const inboxMailbox = newJmapMailbox({ id: inboxId, role: 'inbox' });

    test('When opening a conversation with several messages, then all of them are returned from newest to oldest', async () => {
      const older = newJmapEmail({ receivedAt: '2025-01-01T10:00:00Z' });
      const newer = newJmapEmail({ receivedAt: '2025-01-02T10:00:00Z' });
      const middle = newJmapEmail({ receivedAt: '2025-01-01T15:00:00Z' });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { list: [{ id: older.id, threadId: 'thread-1' }] },
          {
            list: [
              { id: 'thread-1', emailIds: [older.id, middle.id, newer.id] },
            ],
          },
          { list: [older, middle, newer] },
        ),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );

      const result = await provider.getThread('user@test.com', older.id);

      expect(result.map((e) => e.id)).toEqual([newer.id, middle.id, older.id]);
    });

    test('When opening a conversation with a single message, then a one-item list is returned', async () => {
      const only = newJmapEmail();

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { list: [{ id: only.id, threadId: 'thread-1' }] },
          { list: [{ id: 'thread-1', emailIds: [only.id] }] },
          { list: [only] },
        ),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );

      const result = await provider.getThread('user@test.com', only.id);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(only.id);
    });

    test('When the thread contains a self-email that lives both in Inbox and Sent with the same Message-ID, then only the Inbox copy is returned', async () => {
      const sharedMessageId = ['<self@example.com>'];
      const inboxCopy = newJmapEmail({
        receivedAt: '2025-01-01T10:00:00Z',
        mailboxIds: { [inboxId]: true },
        messageId: sharedMessageId,
      });
      const sentCopy = newJmapEmail({
        receivedAt: '2025-01-01T10:00:00Z',
        mailboxIds: { [sentId]: true },
        messageId: sharedMessageId,
      });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { list: [{ id: inboxCopy.id, threadId: 'thread-1' }] },
          {
            list: [{ id: 'thread-1', emailIds: [sentCopy.id, inboxCopy.id] }],
          },
          { list: [sentCopy, inboxCopy] },
        ),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );

      const result = await provider.getThread('user@test.com', inboxCopy.id);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(inboxCopy.id);
    });

    test('When two emails in the thread share a Message-ID but neither is in Inbox, then the first one encountered is kept', async () => {
      const sharedMessageId = ['<self@example.com>'];
      const firstCopy = newJmapEmail({
        receivedAt: '2025-01-01T10:00:00Z',
        mailboxIds: { [sentId]: true },
        messageId: sharedMessageId,
      });
      const secondCopy = newJmapEmail({
        receivedAt: '2025-01-01T10:00:00Z',
        mailboxIds: { 'other-mailbox': true },
        messageId: sharedMessageId,
      });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { list: [{ id: firstCopy.id, threadId: 'thread-1' }] },
          {
            list: [{ id: 'thread-1', emailIds: [firstCopy.id, secondCopy.id] }],
          },
          { list: [firstCopy, secondCopy] },
        ),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );

      const result = await provider.getThread('user@test.com', firstCopy.id);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(firstCopy.id);
    });

    test('When thread emails have no Message-ID, then none of them are collapsed', async () => {
      const first = newJmapEmail({
        receivedAt: '2025-01-01T10:00:00Z',
        messageId: null,
      });
      const second = newJmapEmail({
        receivedAt: '2025-01-01T11:00:00Z',
        messageId: null,
      });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { list: [{ id: first.id, threadId: 'thread-1' }] },
          { list: [{ id: 'thread-1', emailIds: [first.id, second.id] }] },
          { list: [first, second] },
        ),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );

      const result = await provider.getThread('user@test.com', first.id);

      expect(result.map((e) => e.id).sort()).toEqual(
        [first.id, second.id].sort(),
      );
    });

    test('When opening a thread that mixes messages received and messages sent by the user, then every email in the thread is returned', async () => {
      const myReply = newJmapEmail({
        receivedAt: '2025-01-01T10:00:00Z',
        mailboxIds: { [sentId]: true },
        messageId: ['<my-reply@example.com>'],
      });
      const theirMessage = newJmapEmail({
        receivedAt: '2025-01-01T11:00:00Z',
        mailboxIds: { [inboxId]: true },
        messageId: ['<their-message@example.com>'],
      });

      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { list: [{ id: theirMessage.id, threadId: 'thread-1' }] },
          {
            list: [{ id: 'thread-1', emailIds: [myReply.id, theirMessage.id] }],
          },
          { list: [myReply, theirMessage] },
        ),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );

      const result = await provider.getThread('user@test.com', theirMessage.id);

      expect(result.map((e) => e.id)).toEqual([theirMessage.id, myReply.id]);
    });

    test('When opening a conversation by an id that does not exist, then an empty list is returned', async () => {
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse({ list: [] }, { list: [] }, { list: [] }),
      );

      const result = await provider.getThread('user@test.com', 'missing-id');

      expect(result).toEqual([]);
    });
  });

  describe('JMAP session reuse', () => {
    function requestsWithoutTheSession() {
      return jmapService.request.mock.calls.filter(
        ([, , options]) => options?.session !== session,
      );
    }

    test('When an operation issues one JMAP request, then the session is fetched once and forwarded', async () => {
      jmapService.request.mockResolvedValue(
        jmapResponse({ list: [newJmapEmail()] }),
      );

      await provider.getEmail('user@test.com', 'email-1');

      expect(jmapService.getSession).toHaveBeenCalledTimes(1);
      expect(requestsWithoutTheSession()).toHaveLength(0);
    });

    test('When an operation resolves a mailbox before querying, then both requests share one session', async () => {
      const inboxMailbox = newJmapMailbox({ role: 'inbox' });
      const rep = newJmapEmail({ threadId: 'thread-1' });

      jmapService.request.mockResolvedValueOnce(
        jmapResponse({ list: [inboxMailbox] }),
      );
      jmapService.request.mockResolvedValueOnce(
        jmapMultiResponse(
          { ids: [rep.id], total: 1 },
          { list: [rep] },
          { list: [{ id: 'thread-1', emailIds: [rep.id] }] },
          { list: [rep] },
        ),
      );

      await provider.listEmails({
        userEmail: 'user@test.com',
        mailbox: 'inbox',
        limit: 20,
        position: 0,
      });

      expect(jmapService.request).toHaveBeenCalledTimes(2);
      expect(jmapService.getSession).toHaveBeenCalledTimes(1);
      expect(requestsWithoutTheSession()).toHaveLength(0);
    });

    test('When an operation fans out to identity and mailbox lookups, then all requests share one session', async () => {
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

      await provider.sendEmail('user@test.com', newSendEmailDto());

      expect(jmapService.request).toHaveBeenCalledTimes(3);
      expect(jmapService.getSession).toHaveBeenCalledTimes(1);
      expect(requestsWithoutTheSession()).toHaveLength(0);
    });

    test('When an operation needs non-default capabilities, then the session is forwarded alongside them', async () => {
      jmapService.request.mockResolvedValue(
        jmapResponse({ list: [newJmapQuota()] }),
      );

      await provider.getQuota('user@test.com');

      expect(jmapService.getSession).toHaveBeenCalledTimes(1);
      expect(jmapService.request).toHaveBeenCalledWith(
        'user@test.com',
        expect.anything(),
        { using: JMAP_QUOTA_CAPABILITIES, session },
      );
    });
  });
});
