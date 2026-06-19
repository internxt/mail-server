/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, test, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Readable } from 'node:stream';
import { EmailService } from './email.service.js';
import { MailProvider } from './mail-provider.port.js';
import { AccountService } from '../account/account.service.js';
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
} from '../../../test/fixtures.js';
import { ENCRYPTED_PREFIX, packEnvelope } from './email-encryption.js';
import {
  unwrapAttachmentKey,
  decryptAttachment,
  decryptBody,
} from './server-crypto.js';

vi.mock('./server-crypto.js', () => ({
  unwrapAttachmentKey: vi.fn(),
  decryptAttachment: vi.fn(),
  decryptBody: vi.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  let provider: DeepMocked<MailProvider>;
  let accountService: DeepMocked<AccountService>;
  let smtp: DeepMocked<StalwartSmtpService>;
  let configService: DeepMocked<ConfigService>;
  const userEmail = 'test@example.com';

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
      provider.sendEmail.mockResolvedValue({ id: 'created-id' });

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
      provider.sendEmail.mockResolvedValue({ id: 'enc-id' });

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
      provider.sendEmail.mockResolvedValue({ id: 'plain-id' });

      await service.sendEmail(userEmail, dto);

      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        dto,
        undefined,
      );
    });

    it('when replying to an existing email, then the reply is delivered into the same conversation', async () => {
      const dto = newSendEmailDto({ inReplyToEmailId: 'parent-id' });
      const threading = {
        messageId: ['<parent@example.com>'],
        references: ['<parent@example.com>'],
      };
      provider.getThreadingHeaders.mockResolvedValue(threading);
      provider.sendEmail.mockResolvedValue({ id: 'reply-id' });

      await service.sendEmail(userEmail, dto);

      expect(provider.getThreadingHeaders).toHaveBeenCalledWith(
        userEmail,
        'parent-id',
      );
      expect(provider.sendEmail).toHaveBeenCalledWith(
        userEmail,
        dto,
        threading,
      );
    });

    it('when replying to an email that no longer exists, then the user is told the original was not found', async () => {
      const dto = newSendEmailDto({ inReplyToEmailId: 'missing-id' });
      provider.getThreadingHeaders.mockResolvedValue(null);

      await expect(service.sendEmail(userEmail, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(provider.sendEmail).not.toHaveBeenCalled();
    });

    it('when sending an email that is not a reply, then no conversation is looked up', async () => {
      const dto = newSendEmailDto();
      provider.sendEmail.mockResolvedValue({ id: 'plain-id' });

      await service.sendEmail(userEmail, dto);

      expect(provider.getThreadingHeaders).not.toHaveBeenCalled();
    });
  });

  describe('sendExternalEmail', () => {
    const mockedUnwrap = vi.mocked(unwrapAttachmentKey);
    const mockedDecrypt = vi.mocked(decryptAttachment);
    const mockedDecryptBody = vi.mocked(decryptBody);

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
      provider.saveToSent.mockResolvedValue({ id: 'sent-1' });

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
      const wrappedKey = newEncryptedWrappedKey();
      const encryption = newEncryptionBlock({
        attachmentWrappedKeys: [wrappedKey],
      });
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
      mockedDecryptBody.mockResolvedValue('plain body text');
      const attachmentKey = new Uint8Array([1, 2, 3, 4]);
      mockedUnwrap.mockResolvedValue(attachmentKey);
      provider.downloadAttachment.mockResolvedValue({
        stream: Readable.from([Buffer.from('cipher-bytes')]),
        contentType: 'image/jpeg',
        contentLength: 12,
      });
      mockedDecrypt.mockResolvedValue(new Uint8Array([9, 9, 9]));
      smtp.sendRaw.mockResolvedValue({ messageId: 'msg-2' });
      provider.saveToSent.mockResolvedValue({ id: 'sent-2' });

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
      );
      expect(result).toEqual({ id: 'msg-2' });
    });

    it('when replying to an external recipient, then the conversation thread is carried through SMTP and the saved copy', async () => {
      const dto = newSendEmailDto({
        inReplyToEmailId: 'parent-id',
        textBody: 'replying out',
        encryption: undefined,
      });
      const threading = {
        messageId: ['<parent@example.com>'],
        references: ['<grandparent@example.com>', '<parent@example.com>'],
      };
      provider.getThreadingHeaders.mockResolvedValue(threading);
      configService.getOrThrow.mockReturnValue(
        Buffer.from('server-priv-key').toString('base64'),
      );
      smtp.sendRaw.mockResolvedValue({ messageId: 'msg-3' });
      provider.saveToSent.mockResolvedValue({ id: 'sent-3' });

      await service.sendExternalEmail(userEmail, dto);

      expect(smtp.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<parent@example.com>',
          references: ['<grandparent@example.com>', '<parent@example.com>'],
        }),
      );
      expect(provider.saveToSent).toHaveBeenCalledWith(
        userEmail,
        expect.any(Object),
        threading,
      );
    });

    it('when replying to an external recipient and the original no longer exists, then the reply is rejected before reaching SMTP', async () => {
      const dto = newSendEmailDto({ inReplyToEmailId: 'missing-id' });
      provider.getThreadingHeaders.mockResolvedValue(null);

      await expect(service.sendExternalEmail(userEmail, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(smtp.sendRaw).not.toHaveBeenCalled();
      expect(provider.saveToSent).not.toHaveBeenCalled();
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
      provider.saveDraft.mockResolvedValue({ id: 'draft-id' });

      const result = await service.saveDraft(userEmail, dto);

      expect(provider.saveDraft).toHaveBeenCalledWith(userEmail, dto);
      expect(result).toEqual({ id: 'draft-id' });
    });

    it('when DTO has encryption block, then serializes it into textBody and clears htmlBody', async () => {
      const encryption = newEncryptionBlock();
      const dto = newDraftEmailDto({
        encryption,
        htmlBody: '<p>original</p>',
      });
      provider.saveDraft.mockResolvedValue({ id: 'enc-draft-id' });

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
      provider.updateDraft.mockResolvedValue({ newDraftId: 'new-draft-id' });

      const result = await service.updateDraft(userEmail, 'draft-id', dto);

      expect(provider.updateDraft).toHaveBeenCalledWith(
        userEmail,
        'draft-id',
        dto,
      );
      expect(result).toEqual({ newDraftId: 'new-draft-id' });
    });

    it('when DTO has encryption block, then serializes it into textBody and clears htmlBody', async () => {
      const encryption = newEncryptionBlock();
      const dto = newDraftEmailDto({
        encryption,
        htmlBody: '<p>original</p>',
      });
      provider.updateDraft.mockResolvedValue({ newDraftId: 'new-enc-draft' });

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
  });

  describe('Discard Draft', () => {
    test('When the user discards an existing draft, then it is removed from their mailbox', async () => {
      const draft = newEmail({ isDraft: true });
      provider.getDraft.mockResolvedValue(draft);
      provider.discardDraft.mockResolvedValue(undefined);

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
    it('when called, then delegates to provider', async () => {
      provider.deleteEmail.mockResolvedValue(undefined);

      await service.deleteEmail(userEmail, 'email-id');

      expect(provider.deleteEmail).toHaveBeenCalledWith(userEmail, 'email-id');
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
