/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, test, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Readable } from 'node:stream';
import { EmailService } from './email.service.js';
import {
  DraftUpdateConflictError,
  MailProvider,
  SendEmailFailedError,
} from './mail-provider.port.js';
import { AccountService } from '../account/account.service.js';
import { MailUsageService } from '../usage/mail-usage.service.js';
import { StalwartSmtpService } from '../infrastructure/smtp/stalwart-smtp.service.js';
import {
  newMailbox,
  newEmail,
  newEmailSummary,
  newSendEmailDto,
  newDraftEmailDto,
  newSearchEmailDto,
  newEncryptionBlock,
  newEncryptedWrappedKey,
  newThreadingHeaders,
  newSendEmailResult,
  newUpdateDraftResult,
} from '../../../test/fixtures.js';
import { ENCRYPTED_PREFIX, packEnvelope } from './email-encryption.js';
import {
  decryptAttachment,
  decryptEnvelopeWithServerKey,
} from './server-crypto.js';

vi.mock('./server-crypto.js', () => ({
  decryptAttachment: vi.fn(),
  decryptEnvelopeWithServerKey: vi.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  let provider: DeepMocked<MailProvider>;
  let accountService: DeepMocked<AccountService>;
  let smtp: DeepMocked<StalwartSmtpService>;
  let configService: DeepMocked<ConfigService>;
  let usage: DeepMocked<MailUsageService>;
  const userEmail = 'test@example.com';
  const BUCKET_CONTEXT = {
    mailAddressId: 'address-1',
    userUuid: 'user-1',
    networkBucketId: 'bucket-1',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [EmailService],
    })
      .useMocker(() => createMock<MailProvider>())
      .compile();

    service = module.get(EmailService);
    provider = module.get<DeepMocked<MailProvider>>(MailProvider);
    accountService = module.get<DeepMocked<AccountService>>(AccountService);
    smtp = module.get<DeepMocked<StalwartSmtpService>>(StalwartSmtpService);
    configService = module.get<DeepMocked<ConfigService>>(ConfigService);
    usage = module.get<DeepMocked<MailUsageService>>(MailUsageService);
  });

  describe('getMailboxes', () => {
    it('when called, then delegates to mail provider', async () => {
      const mailboxes = [newMailbox(), newMailbox()];
      provider.getMailboxes.mockResolvedValue(mailboxes);

      const result = await service.getMailboxes(userEmail);

      expect(provider.getMailboxes).toHaveBeenCalledWith(userEmail);
      expect(result).toBe(mailboxes);
    });
  });

  describe('listEmails', () => {
    it('when called with a mailbox, then delegates with mailbox', async () => {
      const response = {
        emails: [newEmailSummary()],
        total: 1,
        hasMoreMails: false,
        nextAnchor: undefined,
      };
      provider.listEmails.mockResolvedValue(response);

      const params = {
        userEmail,
        mailbox: 'inbox' as const,
        limit: 20,
        position: 0,
      };
      const result = await service.listEmails(params);

      expect(provider.listEmails).toHaveBeenCalledWith(params);
      expect(result).toBe(response);
    });

    it('when called without a mailbox, then delegates with undefined', async () => {
      const response = {
        emails: [newEmailSummary()],
        total: 1,
        hasMoreMails: false,
        nextAnchor: undefined,
      };
      provider.listEmails.mockResolvedValue(response);

      const params = {
        userEmail,
        mailbox: undefined,
        limit: 20,
        position: 0,
      };
      const result = await service.listEmails(params);

      expect(provider.listEmails).toHaveBeenCalledWith(params);
      expect(result).toBe(response);
    });

    it('when page has no encrypted rows, then it does not fetch bodies', async () => {
      provider.listEmails.mockResolvedValue({
        emails: [newEmailSummary({ preview: 'plain preview' })],
        total: 1,
        hasMoreMails: false,
      });

      await service.listEmails({ userEmail, limit: 20, position: 0 });

      expect(provider.getTextBodies).not.toHaveBeenCalled();
    });

    it('when page has encrypted rows, then it enriches those with the preview and wrapped keys', async () => {
      const envelope = newEncryptionBlock({
        wrappedKeys: [newEncryptedWrappedKey(), newEncryptedWrappedKey()],
      });
      const encrypted = newEmailSummary({
        preview: `${ENCRYPTED_PREFIX} truncated…`,
      });
      const plain = newEmailSummary({ preview: 'plain preview' });

      provider.listEmails.mockResolvedValue({
        emails: [encrypted, plain],
        total: 2,
        hasMoreMails: false,
      });
      provider.getTextBodies.mockResolvedValue(
        new Map([[encrypted.id, packEnvelope(envelope)]]),
      );

      const result = await service.listEmails({
        userEmail,
        limit: 20,
        position: 0,
      });

      expect(provider.getTextBodies).toHaveBeenCalledWith(userEmail, [
        encrypted.id,
      ]);
      expect(result.emails[0]!.encryption).toEqual({
        encryptedPreview: envelope.encryptedPreview,
        wrappedKeys: envelope.wrappedKeys,
      });
      expect(result.emails[0]!.preview).toBe('');
      expect(result.emails[1]!.encryption).toBeUndefined();
      expect(result.emails[1]!.preview).toBe('plain preview');
    });

    it('when an encrypted preview has leading whitespace, then it is still detected and enriched', async () => {
      const envelope = newEncryptionBlock();
      const encrypted = newEmailSummary({
        preview: `\n  ${ENCRYPTED_PREFIX} truncated…`,
      });

      provider.listEmails.mockResolvedValue({
        emails: [encrypted],
        total: 1,
        hasMoreMails: false,
      });
      provider.getTextBodies.mockResolvedValue(
        new Map([[encrypted.id, packEnvelope(envelope)]]),
      );

      const result = await service.listEmails({
        userEmail,
        limit: 20,
        position: 0,
      });

      expect(provider.getTextBodies).toHaveBeenCalledWith(userEmail, [
        encrypted.id,
      ]);
      expect(result.emails[0]!.encryption).toEqual({
        encryptedPreview: envelope.encryptedPreview,
        wrappedKeys: envelope.wrappedKeys,
      });
      expect(result.emails[0]!.preview).toBe('');
    });

    it('when an encrypted row body is missing, then encryption is null', async () => {
      const encrypted = newEmailSummary({
        preview: `${ENCRYPTED_PREFIX} truncated…`,
      });

      provider.listEmails.mockResolvedValue({
        emails: [encrypted],
        total: 1,
        hasMoreMails: false,
      });
      provider.getTextBodies.mockResolvedValue(new Map());

      const result = await service.listEmails({
        userEmail,
        limit: 20,
        position: 0,
      });

      expect(result.emails[0]!.encryption).toBeNull();
      expect(result.emails[0]!.preview).toBe('');
    });
  });

  describe('getEmail', () => {
    it('when opening an email that exists, then the full email is returned to the caller', async () => {
      const email = newEmail();
      provider.getEmail.mockResolvedValue(email);

      const result = await service.getEmail(userEmail, email.id);

      expect(result).toBe(email);
    });

    it('when opening an email that does not exist, then the user is told it was not found', async () => {
      provider.getEmail.mockResolvedValue(null);

      await expect(service.getEmail(userEmail, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getThread', () => {
    it('when opening a conversation with several emails, then all messages in the conversation are returned', async () => {
      const emails = [newEmail(), newEmail(), newEmail()];
      provider.getThread.mockResolvedValue(emails);

      const result = await service.getThread(userEmail, emails[0]!.id);

      expect(provider.getThread).toHaveBeenCalledWith(userEmail, emails[0]!.id);
      expect(result).toBe(emails);
    });

    it('when opening a single-message conversation, then a one-item list is returned', async () => {
      const email = newEmail();
      provider.getThread.mockResolvedValue([email]);

      const result = await service.getThread(userEmail, email.id);

      expect(result).toEqual([email]);
    });

    it('when opening a conversation by an id that does not exist, then the user is told it was not found', async () => {
      provider.getThread.mockResolvedValue([]);

      await expect(service.getThread(userEmail, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('when a conversation contains end-to-end encrypted messages, then the encrypted previews and wrapped keys are attached for the client to decrypt', async () => {
      const envelope = newEncryptionBlock();
      const encryptedEmail = newEmail({
        preview: `${ENCRYPTED_PREFIX} truncated…`,
      });
      const plainEmail = newEmail({ preview: 'plain preview' });
      provider.getThread.mockResolvedValue([encryptedEmail, plainEmail]);
      provider.getTextBodies.mockResolvedValue(
        new Map([[encryptedEmail.id, packEnvelope(envelope)]]),
      );

      const result = await service.getThread(userEmail, encryptedEmail.id);

      expect(result[0]!.encryption).toEqual({
        encryptedPreview: envelope.encryptedPreview,
        wrappedKeys: envelope.wrappedKeys,
      });
      expect(result[0]!.preview).toBe('');
      expect(result[1]!.encryption).toBeUndefined();
    });
  });

  describe('search', () => {
    it('when called, then delegates to provider with the given params', async () => {
      const response = {
        emails: [newEmailSummary()],
        total: 1,
        hasMoreMails: false,
        nextAnchor: undefined,
      };
      provider.search.mockResolvedValue(response);

      const params = newSearchEmailDto();
      const result = await service.search(params);

      expect(provider.search).toHaveBeenCalledWith(params);
      expect(result).toBe(response);
    });
  });

  describe('sendEmail', () => {
    it('when sending an email with recipients, then it gets delivered through the mail provider', async () => {
      const dto = newSendEmailDto();
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'created-id' }),
      );

      const result = await service.sendEmail(userEmail, dto);

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        dto,
        undefined,
      );
      expect(result).toEqual({ id: 'created-id' });
    });

    it('when sending an email with no recipients, then it is rejected before delivery', async () => {
      const dto = newSendEmailDto({ to: [] });

      await expect(service.sendEmail(userEmail, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(provider.sendEmail).not.toHaveBeenCalled();
    });

    it('when sending an end-to-end encrypted email, then the encrypted payload is delivered and the plain HTML body is discarded', async () => {
      const encryption = newEncryptionBlock();
      const dto = newSendEmailDto({ encryption, htmlBody: '<p>original</p>' });
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'enc-id' }),
      );

      await service.sendEmail(userEmail, dto);

      const expectedBundle = Buffer.from(JSON.stringify(encryption)).toString(
        'base64',
      );
      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({
          textBody: `INTERNXT-ENCRYPTED-EMAIL-v1\n${expectedBundle}`,
          htmlBody: undefined,
        }),
        undefined,
      );
    });

    it('when sending a plain email, then the body is delivered as the user wrote it', async () => {
      const dto = newSendEmailDto({ htmlBody: '<p>hello</p>' });
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'plain-id' }),
      );

      await service.sendEmail(userEmail, dto);

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        dto,
        undefined,
      );
    });

    test('When sending an email, then no conversation is looked up because sends are not threaded', async () => {
      const dto = newSendEmailDto();
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'plain-id' }),
      );

      await service.sendEmail(userEmail, dto);

      expect(provider.getThreadingHeaders).not.toHaveBeenCalled();
      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        dto,
        undefined,
      );
    });
  });

  describe('Replying an email', () => {
    const PARENT_ID = 'parent-id';
    const SENDER = { email: 'sender@example.com' };
    const OTHER = { email: 'other@example.com' };
    // Original: from=sender, to=[me, other], cc=[] — so a reply goes to the
    // sender and a reply-all also cc's `other` (never `me`).
    const THREADING = newThreadingHeaders({
      parentFrom: [SENDER],
      parentReplyTo: [],
      parentTo: [{ email: userEmail }, OTHER],
      parentCc: [],
    });

    test('When replying, then the recipient is derived from the original sender, not the caller', async () => {
      provider.getThreadingHeaders.mockResolvedValue(THREADING);
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'reply-id' }),
      );

      await service.replyEmail(userEmail, PARENT_ID, { textBody: 'ok' });

      expect(provider.getThreadingHeaders).toHaveBeenCalledWith(
        userEmail,
        PARENT_ID,
      );
      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({ to: [SENDER], cc: [] }),
        THREADING,
      );
    });

    test('When replying to all the users involved in a conversation, then the other participants are cc’d and the caller is excluded', async () => {
      provider.getThreadingHeaders.mockResolvedValue(THREADING);
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'reply-id' }),
      );

      await service.replyEmail(userEmail, PARENT_ID, {
        textBody: 'ok',
        replyAll: true,
      });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({ to: [SENDER], cc: [OTHER] }),
        THREADING,
      );
    });

    test('When the caller adds extra cc, then it is merged with the derived recipients', async () => {
      const extra = { email: 'extra@example.com' };
      provider.getThreadingHeaders.mockResolvedValue(THREADING);
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'reply-id' }),
      );

      await service.replyEmail(userEmail, PARENT_ID, {
        textBody: 'ok',
        cc: [extra],
      });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({ to: [SENDER], cc: [extra] }),
        THREADING,
      );
    });

    test('When the reply omits a subject, then a "Re:"-prefixed subject is derived from the original', async () => {
      provider.getThreadingHeaders.mockResolvedValue(THREADING);
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'reply-id' }),
      );

      await service.replyEmail(userEmail, PARENT_ID, { textBody: 'ok' });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({ subject: 'Re: Weekly sync notes' }),
        THREADING,
      );
    });

    test('When the reply provides a subject, then it is used as-is', async () => {
      provider.getThreadingHeaders.mockResolvedValue(THREADING);
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'reply-id' }),
      );

      await service.replyEmail(userEmail, PARENT_ID, {
        textBody: 'ok',
        subject: 'A different subject',
      });

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({ subject: 'A different subject' }),
        THREADING,
      );
    });

    test('When the original has no sender to reply to, then the reply is rejected as unprocessable', async () => {
      provider.getThreadingHeaders.mockResolvedValue(
        newThreadingHeaders({ parentFrom: [], parentReplyTo: [] }),
      );

      await expect(
        service.replyEmail(userEmail, PARENT_ID, { textBody: 'ok' }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(provider.sendEmail).not.toHaveBeenCalled();
    });

    test('When the original email does not exist, then an error indicating so is thrown', async () => {
      provider.getThreadingHeaders.mockResolvedValue(null);

      await expect(
        service.replyEmail(userEmail, 'missing-id', { textBody: 'ok' }),
      ).rejects.toThrow(NotFoundException);
      expect(provider.sendEmail).not.toHaveBeenCalled();
    });

    test('When is an external delivery (3rd party users), then the reply is dispatched over SMTP with the threading headers', async () => {
      provider.getThreadingHeaders.mockResolvedValue(THREADING);
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      smtp.sendRaw.mockResolvedValue({ messageId: '<reply-sent@example.com>' });
      provider.saveToSent.mockResolvedValue(
        newSendEmailResult({ id: 'sent-id' }),
      );

      await service.replyEmail(
        userEmail,
        PARENT_ID,
        { textBody: 'ok' },
        'EXTERNAL',
      );

      expect(smtp.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [SENDER],
          inReplyTo: THREADING.messageId[0],
          references: THREADING.references,
        }),
      );
    });
  });

  describe('sendExternalEmail', () => {
    const mockedDecrypt = vi.mocked(decryptAttachment);
    const mockedDecryptEnvelope = vi.mocked(decryptEnvelopeWithServerKey);

    it('when sending an external email with no recipients, then it is rejected before reaching SMTP', async () => {
      const dto = newSendEmailDto({ to: [] });

      await expect(service.sendExternalEmail(userEmail, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(smtp.sendRaw).not.toHaveBeenCalled();
    });

    it('when sending a plain external email, then it is delivered over SMTP and a copy is kept in Sent', async () => {
      const dto = newSendEmailDto({
        attachments: undefined,
        encryption: undefined,
        textBody: 'hello',
      });
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      smtp.sendRaw.mockResolvedValue({ messageId: 'msg-1' });
      provider.saveToSent.mockResolvedValue(
        newSendEmailResult({ id: 'sent-1' }),
      );

      const result = await service.sendExternalEmail(userEmail, dto);

      expect(smtp.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          userEmail,
          to: dto.to,
          subject: dto.subject,
          text: 'hello',
          attachments: undefined,
        }),
      );
      expect(provider.saveToSent).toHaveBeenCalled();
      expect(result).toEqual({ id: 'msg-1' });
    });

    it('when sending an external email with encrypted attachments but no key for the server to decrypt them, then the email is rejected', async () => {
      const dto = newSendEmailDto({
        attachments: [
          { blobId: 'b1', name: 'f.txt', type: 'text/plain', size: 10 },
        ],
        encryption: undefined,
      });
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );

      await expect(service.sendExternalEmail(userEmail, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(smtp.sendRaw).not.toHaveBeenCalled();
    });

    it('when sending an external email with end-to-end encrypted body and attachments, then the recipient receives them in clear and the user keeps the encrypted copy in Sent', async () => {
      const encryption = newEncryptionBlock();
      const dto = newSendEmailDto({
        attachments: [
          { blobId: 'b1', name: 'photo.jpg', type: 'image/jpeg', size: 1024 },
        ],
        encryption,
        textBody: 'check the attachment',
      });
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      const attachmentKey = new Uint8Array([1, 2, 3, 4]);
      mockedDecryptEnvelope.mockResolvedValue({
        body: 'plain body text',
        attachmentsSessionKey: attachmentKey,
      });
      provider.downloadAttachment.mockResolvedValue({
        stream: Readable.from([Buffer.from('cipher-bytes')]),
        contentType: 'image/jpeg',
        contentLength: 12,
      });
      mockedDecrypt.mockResolvedValue(new Uint8Array([9, 9, 9]));
      smtp.sendRaw.mockResolvedValue({ messageId: 'msg-2' });
      provider.saveToSent.mockResolvedValue(
        newSendEmailResult({ id: 'sent-2' }),
      );

      const result = await service.sendExternalEmail(userEmail, dto);

      expect(smtp.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'plain body text',
          attachments: [
            {
              filename: 'photo.jpg',
              content: Buffer.from([9, 9, 9]),
              contentType: 'image/jpeg',
            },
          ],
        }),
      );
      expect(provider.saveToSent).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({
          textBody: expect.stringContaining('INTERNXT-ENCRYPTED-EMAIL-v1'),
        }),
        undefined,
        'msg-2',
      );
      expect(result).toEqual({ id: 'msg-2' });
    });

    it('when the decrypted body is HTML, then it is delivered as the HTML part with a plain-text alternative', async () => {
      const dto = newSendEmailDto({
        attachments: undefined,
        encryption: newEncryptionBlock(),
      });
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      mockedDecryptEnvelope.mockResolvedValue({
        body: '<p>Testing the new mail config</p><p>lmk how it goes!</p>',
        attachmentsSessionKey: new Uint8Array([1, 2, 3, 4]),
      });
      smtp.sendRaw.mockResolvedValue({ messageId: 'msg-html' });
      provider.saveToSent.mockResolvedValue(
        newSendEmailResult({ id: 'sent-html' }),
      );

      await service.sendExternalEmail(userEmail, dto);

      expect(smtp.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>Testing the new mail config</p><p>lmk how it goes!</p>',
          text: 'Testing the new mail config\n\nlmk how it goes!',
        }),
      );
    });

    test('When delivering externally, then the Sent copy reuses the Message-ID assigned by SMTP so both copies thread together', async () => {
      const dto = newSendEmailDto({
        textBody: 'sending out',
        encryption: undefined,
      });
      const smtpMessageId = '<delivered@external.com>';
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      smtp.sendRaw.mockResolvedValue({ messageId: smtpMessageId });
      provider.saveToSent.mockResolvedValue(
        newSendEmailResult({ id: 'sent-id' }),
      );

      await service.sendExternalEmail(userEmail, dto);

      expect(provider.saveToSent).toHaveBeenCalledWith(
        userEmail,
        expect.any(Object),
        undefined,
        smtpMessageId,
      );
    });
  });

  describe('lookupRecipientKeys', () => {
    it('when called, then delegates to accountService and wraps the result', async () => {
      const recipients = [
        { address: 'alice@internxt.me', publicKey: 'pubkey-alice' },
        { address: 'bob@external.com', publicKey: null },
      ];
      accountService.lookupPublicKeysForAddresses.mockResolvedValue(recipients);

      const result = await service.lookupRecipientKeys([
        'alice@internxt.me',
        'bob@external.com',
      ]);

      expect(accountService.lookupPublicKeysForAddresses).toHaveBeenCalledWith([
        'alice@internxt.me',
        'bob@external.com',
      ]);
      expect(result).toEqual({ recipients });
    });
  });

  describe('saveDraft', () => {
    it('when called, then delegates to provider', async () => {
      const dto = newDraftEmailDto();
      const savedDraft = newEmail({ isDraft: true });
      provider.saveDraft.mockResolvedValue(savedDraft);

      const result = await service.saveDraft(userEmail, dto);

      expect(provider.saveDraft).toHaveBeenCalledWith(userEmail, dto);
      expect(result).toBe(savedDraft);
    });

    it('when DTO has encryption block, then serializes it into textBody and clears htmlBody', async () => {
      const encryption = newEncryptionBlock();
      const dto = newDraftEmailDto({
        encryption,
        htmlBody: '<p>original</p>',
      });
      provider.saveDraft.mockResolvedValue(newEmail({ isDraft: true }));

      await service.saveDraft(userEmail, dto);

      const expectedBundle = Buffer.from(JSON.stringify(encryption)).toString(
        'base64',
      );
      expect(provider.saveDraft).toHaveBeenCalledWith(
        userEmail,
        expect.objectContaining({
          textBody: `INTERNXT-ENCRYPTED-EMAIL-v1\n${expectedBundle}`,
          htmlBody: undefined,
        }),
      );
    });
  });

  describe('updateDraft', () => {
    it('when called, then delegates to provider', async () => {
      const dto = newDraftEmailDto();
      const updatedDraft = newEmail({ isDraft: true });
      provider.updateDraft.mockResolvedValue(
        newUpdateDraftResult({ draft: updatedDraft }),
      );

      const result = await service.updateDraft(userEmail, 'draft-id', dto);

      expect(provider.updateDraft).toHaveBeenCalledWith(
        userEmail,
        'draft-id',
        dto,
      );
      expect(result).toBe(updatedDraft);
    });

    it('when DTO has encryption block, then serializes it into textBody and clears htmlBody', async () => {
      const encryption = newEncryptionBlock();
      const dto = newDraftEmailDto({
        encryption,
        htmlBody: '<p>original</p>',
      });
      provider.updateDraft.mockResolvedValue(
        newUpdateDraftResult({ draft: newEmail({ isDraft: true }) }),
      );

      await service.updateDraft(userEmail, 'draft-id', dto);

      const expectedBundle = Buffer.from(JSON.stringify(encryption)).toString(
        'base64',
      );
      expect(provider.updateDraft).toHaveBeenCalledWith(
        userEmail,
        'draft-id',
        expect.objectContaining({
          textBody: `INTERNXT-ENCRYPTED-EMAIL-v1\n${expectedBundle}`,
          htmlBody: undefined,
        }),
      );
    });

    test('When the user tries to update a draft that does not exist, then they are told it was not found', async () => {
      provider.updateDraft.mockResolvedValue(null);

      await expect(
        service.updateDraft(userEmail, 'missing-draft', newDraftEmailDto()),
      ).rejects.toThrow(NotFoundException);
    });

    test('When the draft was modified concurrently, then the caller gets a conflict so it can retry the save', async () => {
      provider.updateDraft.mockRejectedValue(
        new DraftUpdateConflictError('draft-id'),
      );

      await expect(
        service.updateDraft(userEmail, 'draft-id', newDraftEmailDto()),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Discard Draft', () => {
    test('When the user discards an existing draft, then it is removed from their mailbox', async () => {
      const draft = newEmail({ isDraft: true });
      provider.getDraft.mockResolvedValue(draft);
      provider.discardDraft.mockResolvedValue({ deletedEntryKey: null });

      await service.discardDraft(userEmail, draft.id);

      expect(provider.discardDraft).toHaveBeenCalledWith(userEmail, draft.id);
    });

    test('When the user tries to discard a draft that does not exist, then they are told it was not found', async () => {
      provider.getDraft.mockResolvedValue(null);

      await expect(
        service.discardDraft(userEmail, 'missing-draft'),
      ).rejects.toThrow(NotFoundException);
      expect(provider.discardDraft).not.toHaveBeenCalled();
    });
  });

  describe('moveEmail', () => {
    it('when called, then delegates to provider', async () => {
      provider.moveEmail.mockResolvedValue(undefined);

      await service.moveEmail(userEmail, 'email-id', 'trash');

      expect(provider.moveEmail).toHaveBeenCalledWith(
        userEmail,
        'email-id',
        'trash',
      );
    });
  });

  describe('deleteEmail', () => {
    it('when the message is moved to trash, then no quota entry is released', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: null });

      await service.deleteEmail(userEmail, 'email-id');

      expect(provider.deleteEmail).toHaveBeenCalledWith(userEmail, 'email-id');
      expect(usage.releaseStoredMessage).not.toHaveBeenCalled();
    });

    it('when the message is permanently destroyed, then releases the quota entry on the address bucket', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: '42:7' });
      accountService.findBucketContextByAddress.mockResolvedValue(
        BUCKET_CONTEXT,
      );

      await service.deleteEmail(userEmail, 'email-id');

      expect(accountService.findBucketContextByAddress).toHaveBeenCalledWith(
        userEmail,
      );
      expect(usage.releaseStoredMessage).toHaveBeenCalledWith({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:7',
      });
    });

    it('when the destroyed address has no network bucket, then no quota entry is released', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: '42:7' });
      accountService.findBucketContextByAddress.mockResolvedValue({
        mailAddressId: 'address-1',
        userUuid: 'user-1',
        networkBucketId: null,
      });

      await service.deleteEmail(userEmail, 'email-id');

      expect(usage.releaseStoredMessage).not.toHaveBeenCalled();
    });

    it('when releasing the quota entry fails, then the deletion still succeeds', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: '42:7' });
      accountService.findBucketContextByAddress.mockResolvedValue(
        BUCKET_CONTEXT,
      );
      usage.releaseStoredMessage.mockRejectedValue(new Error('Bridge down'));

      await expect(
        service.deleteEmail(userEmail, 'email-id'),
      ).resolves.toBeUndefined();
    });
  });

  describe('quota release on the compose paths', () => {
    beforeEach(() => {
      accountService.findBucketContextByAddress.mockResolvedValue(
        BUCKET_CONTEXT,
      );
    });

    it('when sending consumes a draft, then the draft quota entry is released', async () => {
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'sent-id', deletedEntryKey: '42:7' }),
      );

      await service.sendEmail(userEmail, newSendEmailDto({ draftId: 'c' }));

      expect(usage.releaseStoredMessage).toHaveBeenCalledWith({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:7',
      });
    });

    it('when sending does not consume a draft, then no quota entry is released', async () => {
      provider.sendEmail.mockResolvedValue(
        newSendEmailResult({ id: 'sent-id' }),
      );

      await service.sendEmail(userEmail, newSendEmailDto());

      expect(usage.releaseStoredMessage).not.toHaveBeenCalled();
    });

    it('when an externally delivered email consumes a draft, then the draft quota entry is released', async () => {
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      smtp.sendRaw.mockResolvedValue({ messageId: 'smtp-id' });
      provider.saveToSent.mockResolvedValue(
        newSendEmailResult({ id: 'sent-id', deletedEntryKey: '42:8' }),
      );

      await service.sendExternalEmail(
        userEmail,
        newSendEmailDto({ draftId: 'c' }),
      );

      expect(usage.releaseStoredMessage).toHaveBeenCalledWith({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:8',
      });
    });

    it('when a draft is updated, then the replaced draft quota entry is released', async () => {
      provider.updateDraft.mockResolvedValue(
        newUpdateDraftResult({
          draft: newEmail({ isDraft: true }),
          deletedEntryKey: '42:9',
        }),
      );

      await service.updateDraft(userEmail, 'draft-id', newDraftEmailDto());

      expect(usage.releaseStoredMessage).toHaveBeenCalledWith({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:9',
      });
    });

    it('when a draft is discarded, then its quota entry is released', async () => {
      provider.getDraft.mockResolvedValue(newEmail({ isDraft: true }));
      provider.discardDraft.mockResolvedValue({ deletedEntryKey: '42:10' });

      await service.discardDraft(userEmail, 'draft-id');

      expect(usage.releaseStoredMessage).toHaveBeenCalledWith({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:10',
      });
    });

    it('when sending fails after the draft was destroyed, then the draft quota entry is still released and the error propagates', async () => {
      provider.sendEmail.mockRejectedValue(new SendEmailFailedError('42:11'));

      await expect(
        service.sendEmail(userEmail, newSendEmailDto({ draftId: 'c' })),
      ).rejects.toThrow(SendEmailFailedError);

      expect(usage.releaseStoredMessage).toHaveBeenCalledWith({
        userUuid: 'user-1',
        bucketId: 'bucket-1',
        entryKey: '42:11',
      });
    });

    it('when sending fails without destroying a draft, then no quota entry is released and the error propagates', async () => {
      provider.sendEmail.mockRejectedValue(new SendEmailFailedError(null));

      await expect(
        service.sendEmail(userEmail, newSendEmailDto()),
      ).rejects.toThrow(SendEmailFailedError);

      expect(usage.releaseStoredMessage).not.toHaveBeenCalled();
    });

    it('when sending fails for an unrelated reason, then no quota entry is released and the error propagates unchanged', async () => {
      const error = new Error('JMAP request timed out');
      provider.sendEmail.mockRejectedValue(error);

      await expect(
        service.sendEmail(userEmail, newSendEmailDto({ draftId: 'c' })),
      ).rejects.toThrow(error);

      expect(usage.releaseStoredMessage).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('when called with true, then delegates to provider', async () => {
      provider.markAsRead.mockResolvedValue(undefined);

      await service.markAsRead(userEmail, 'email-id', true);

      expect(provider.markAsRead).toHaveBeenCalledWith(
        userEmail,
        'email-id',
        true,
      );
    });
  });

  describe('markAsFlagged', () => {
    it('when called with false, then delegates to provider', async () => {
      provider.markAsFlagged.mockResolvedValue(undefined);

      await service.markAsFlagged(userEmail, 'email-id', false);

      expect(provider.markAsFlagged).toHaveBeenCalledWith(
        userEmail,
        'email-id',
        false,
      );
    });
  });
});
