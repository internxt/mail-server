import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { EmailService } from './email.service.js';
import { MailProvider } from './mail-provider.port.js';
import { AccountService } from '../account/account.service.js';
import {
  newMailbox,
  newEmail,
  newEmailSummary,
  newSendEmailDto,
  newDraftEmailDto,
  newSearchEmailDto,
  newEncryptionBlock,
  newEncryptedWrappedKey,
  newMailQuota,
  newMailAccountAttributes,
  newMailAddressAttributes,
} from '../../../test/fixtures.js';
import { MailAccount } from '../account/domain/mail-account.domain.js';
import { ENCRYPTED_PREFIX, packEnvelope } from './email-encryption.js';

describe('EmailService', () => {
  let service: EmailService;
  let provider: DeepMocked<MailProvider>;
  let accountService: DeepMocked<AccountService>;
  const userEmail = 'test@example.com';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EmailService],
    })
      .useMocker(() => createMock<MailProvider>())
      .compile();

    service = module.get(EmailService);
    provider = module.get<DeepMocked<MailProvider>>(MailProvider);
    accountService = module.get<DeepMocked<AccountService>>(AccountService);
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

  describe('getQuotaByUuid', () => {
    it('when account exists with a default address, then returns quota for that address', async () => {
      const addressAttrs = newMailAddressAttributes({
        isDefault: true,
        address: 'alice@internxt.me',
      });
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [addressAttrs] }),
      );
      const quota = newMailQuota({ used: 512, limit: 1073741824 });
      accountService.findAccount.mockResolvedValue(account);
      provider.getQuota.mockResolvedValue(quota);

      const result = await service.getQuotaByUuid(account.userId);

      expect(accountService.findAccount).toHaveBeenCalledWith(account.userId);
      expect(provider.getQuota).toHaveBeenCalledWith('alice@internxt.me');
      expect(result).toEqual(quota);
    });

    it('when account does not exist, then throws NotFoundException', async () => {
      accountService.findAccount.mockResolvedValue(null);

      await expect(service.getQuotaByUuid('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('when account has no default address, then throws NotFoundException', async () => {
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [] }),
      );
      accountService.findAccount.mockResolvedValue(account);

      await expect(service.getQuotaByUuid(account.userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
