import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';
import {
  newMailbox,
  newEmailSummary,
  newUserPayload,
} from '../../../test/fixtures.js';
import type { EmailListResponse } from './email.types.js';

describe('EmailController', () => {
  let controller: EmailController;
  let emailService: DeepMocked<EmailService>;
  const userEmail = newUserPayload().email;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
    })
      .useMocker(() => createMock<EmailService>())
      .compile();

    controller = module.get<EmailController>(EmailController);
    emailService = module.get(EmailService);
  });

  describe('getMailboxes', () => {
    it('When getMailboxes is called, then it returns the mailboxes', async () => {
      const mailboxes = [newMailbox(), newMailbox()];
      emailService.getMailboxes.mockResolvedValue(mailboxes);

      const result = await controller.getMailboxes(userEmail);

      expect(emailService.getMailboxes).toHaveBeenCalledWith(userEmail);
      expect(result).toBe(mailboxes);
    });
  });

  describe('search', () => {
    const searchResponse: EmailListResponse = {
      emails: [newEmailSummary()],
      total: 1,
      hasMoreMails: false,
    };

    it('when called with text filter, then passes it in the filter', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, {
        text: 'hello',
      });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello' },
      });
    });

    it('when called with from and to, then passes them in the filter', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, {
        text: 'hello',
        from: ['alice@example.com'],
        to: ['bob@example.com'],
      });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: {
          text: 'hello',
          from: ['alice@example.com'],
          to: ['bob@example.com'],
        },
      });
    });

    it('when called with after and before, then passes them in the filter', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, {
        text: 'hello',
        after: '2024-01-01T00:00:00Z',
        before: '2024-12-31T23:59:59Z',
      });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: {
          text: 'hello',
          after: '2024-01-01T00:00:00Z',
          before: '2024-12-31T23:59:59Z',
        },
      });
    });

    it('when isRead is true, then passes isRead as boolean true', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, { text: 'hello', isRead: true });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello', isRead: true },
      });
    });

    it('when isRead is false, then passes isRead as boolean false', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, { text: 'hello', isRead: false });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello', isRead: false },
      });
    });

    it('when hasAttachment is true, then passes hasAttachment as boolean true', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, {
        text: 'hello',
        hasAttachment: true,
      });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello', hasAttachment: true },
      });
    });

    it('when called with limit and position, then passes them as numbers', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, {
        text: 'hello',
        limit: 10,
        position: 5,
      });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 10,
        position: 5,
        filter: { text: 'hello' },
      });
    });
  });

  describe('list', () => {
    it('when called with no query params, then it lists all emails', async () => {
      const response = {
        emails: [newEmailSummary()],
        total: 1,
        hasMoreMails: false,
      };
      emailService.listEmails.mockResolvedValue(response);

      const result = await controller.list(userEmail);

      expect(emailService.listEmails).toHaveBeenCalledWith(
        userEmail,
        undefined,
        20,
        0,
        undefined,
      );
      expect(result).toBe(response);
    });

    it('when called with a mailbox filter, then it filters by mailbox', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'inbox');

      expect(emailService.listEmails).toHaveBeenCalledWith(
        userEmail,
        'inbox',
        20,
        0,
        undefined,
      );
    });

    it('when called with limit, position and anchorId, then it parses them', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'sent', '10', '5', 'Ma1f09b');

      expect(emailService.listEmails).toHaveBeenCalledWith(
        userEmail,
        'sent',
        10,
        5,
        'Ma1f09b',
      );
    });

    it('when called with non-numeric strings, then it falls back to defaults', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'inbox', 'abc', 'xyz');

      expect(emailService.listEmails).toHaveBeenCalledWith(
        userEmail,
        'inbox',
        20,
        0,
        undefined,
      );
    });
  });
});
