import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { EmailService } from './email.service.js';
import { MailProvider } from './mail-provider.port.js';
import {
  newMailbox,
  newEmail,
  newEmailSummary,
  newSendEmailDto,
  newDraftEmailDto,
} from '../../../test/fixtures.js';

describe('EmailService', () => {
  let service: EmailService;
  let provider: DeepMocked<MailProvider>;
  const userEmail = 'test@example.com';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EmailService],
    })
      .useMocker(() => createMock<MailProvider>())
      .compile();

    service = module.get(EmailService);
    provider = module.get<DeepMocked<MailProvider>>(MailProvider);
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

      const result = await service.listEmails(userEmail, 'inbox', 20, 0);

      expect(provider.listEmails).toHaveBeenCalledWith(
        userEmail,
        'inbox',
        20,
        0,
        undefined,
      );
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

      const result = await service.listEmails(userEmail, undefined, 20, 0);

      expect(provider.listEmails).toHaveBeenCalledWith(
        userEmail,
        undefined,
        20,
        0,
        undefined,
      );
      expect(result).toBe(response);
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

      const params = {
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello', isRead: false },
      };
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
});
