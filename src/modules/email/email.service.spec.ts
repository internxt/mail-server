/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Readable } from 'node:stream';
import { EmailService } from './email.service.js';
import { MailProvider } from './mail-provider.port.js';
import { AccountService } from '../account/account.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
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
  let bridge: DeepMocked<BridgeClient>;
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
    bridge = module.get<DeepMocked<BridgeClient>>(BridgeClient);
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
    it('when email exists, then returns it', async () => {
      const email = newEmail();
      provider.getEmail.mockResolvedValue(email);

      const result = await service.getEmail(userEmail, email.id);

      expect(result).toBe(email);
    });

    it('when email does not exist, then throws NotFoundException', async () => {
      provider.getEmail.mockResolvedValue(null);

      await expect(service.getEmail(userEmail, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
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
    it('when DTO has recipients, then delegates to provider', async () => {
      const dto = newSendEmailDto();
      provider.sendEmail.mockResolvedValue({ id: 'created-id' });

      const result = await service.sendEmail(userEmail, dto);

      expect(provider.sendEmail).toHaveBeenCalledWith(userEmail, dto);
      expect(result).toEqual({ id: 'created-id' });
    });

    it('when DTO has empty recipients, then throws BadRequestException', async () => {
      const dto = newSendEmailDto({ to: [] });

      await expect(service.sendEmail(userEmail, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(provider.sendEmail).not.toHaveBeenCalled();
    });

    it('when DTO has encryption block, then serializes it into textBody and clears htmlBody', async () => {
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
      );
    });

    it('when DTO has no encryption, then passes body through unchanged', async () => {
      const dto = newSendEmailDto({ htmlBody: '<p>hello</p>' });
      provider.sendEmail.mockResolvedValue({ id: 'plain-id' });

      await service.sendEmail(userEmail, dto);

      expect(provider.sendEmail).toHaveBeenCalledWith(userEmail, dto);
    });
  });

  describe('sendExternalEmail', () => {
    const mockedUnwrap = vi.mocked(unwrapAttachmentKey);
    const mockedDecrypt = vi.mocked(decryptAttachment);
    const mockedDecryptBody = vi.mocked(decryptBody);

    it('when DTO has empty recipients, then throws BadRequestException', async () => {
      const dto = newSendEmailDto({ to: [] });

      await expect(service.sendExternalEmail(userEmail, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(smtp.sendRaw).not.toHaveBeenCalled();
    });

    it('when DTO has no attachments and no encryption, then sends through SMTP and saves to Sent', async () => {
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

    it('when DTO has attachments but no wrapped keys, then throws BadRequestException', async () => {
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

    it('when DTO has encrypted body and attachments, then decrypts both, sends plain via SMTP and saves cipher to Sent', async () => {
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
      );
      expect(result).toEqual({ id: 'msg-2' });
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
      expect(bridge.deleteBucketEntry).not.toHaveBeenCalled();
    });

    it('when the message is permanently destroyed, then releases the quota entry on the address bucket', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: '42:7' });
      accountService.findBucketContextByAddress.mockResolvedValue({
        userUuid: 'user-1',
        networkBucketId: 'bucket-1',
      });

      await service.deleteEmail(userEmail, 'email-id');

      expect(accountService.findBucketContextByAddress).toHaveBeenCalledWith(
        userEmail,
      );
      expect(bridge.deleteBucketEntry).toHaveBeenCalledWith(
        'user-1',
        'bucket-1',
        '42:7',
      );
    });

    it('when the destroyed address has no network bucket, then no quota entry is released', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: '42:7' });
      accountService.findBucketContextByAddress.mockResolvedValue({
        userUuid: 'user-1',
        networkBucketId: null,
      });

      await service.deleteEmail(userEmail, 'email-id');

      expect(bridge.deleteBucketEntry).not.toHaveBeenCalled();
    });

    it('when releasing the quota entry fails, then the deletion still succeeds', async () => {
      provider.deleteEmail.mockResolvedValue({ deletedEntryKey: '42:7' });
      accountService.findBucketContextByAddress.mockResolvedValue({
        userUuid: 'user-1',
        networkBucketId: 'bucket-1',
      });
      bridge.deleteBucketEntry.mockRejectedValue(new Error('Bridge down'));

      await expect(
        service.deleteEmail(userEmail, 'email-id'),
      ).resolves.toBeUndefined();
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
