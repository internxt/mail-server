import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { type MailProvider } from './mail-provider.port.js';
import {
  newMailbox,
  newEmail,
  newEmailSummary,
  newSendEmailDto,
  newDraftEmailDto,
} from '../../../test/fixtures.js';

type MockMailProvider = {
  [K in keyof MailProvider]: ReturnType<typeof vi.fn>;
};

function createMockMailProvider(): MockMailProvider {
  return {
    getMailboxes: vi.fn(),
    listEmails: vi.fn(),
    getEmail: vi.fn(),
    sendEmail: vi.fn(),
    saveDraft: vi.fn(),
    moveEmail: vi.fn(),
    deleteEmail: vi.fn(),
    markAsRead: vi.fn(),
    markAsFlagged: vi.fn(),
  };
}

describe('EmailService', () => {
  let service: EmailService;
  let provider: MockMailProvider;
  const userEmail = 'test@example.com';

  beforeEach(() => {
    provider = createMockMailProvider();
    service = new EmailService(provider);
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
    it('when called, then delegates with all parameters', async () => {
      const response = {
        emails: [newEmailSummary()],
        total: 1,
      };
      provider.listEmails.mockResolvedValue(response);

      const result = await service.listEmails(userEmail, 'inbox', 20, 0);

      expect(provider.listEmails).toHaveBeenCalledWith(
        userEmail,
        'inbox',
        20,
        0,
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
