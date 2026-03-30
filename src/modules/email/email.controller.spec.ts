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

  describe('list', () => {
    it('When list is called with no query params, then it uses defaults', async () => {
      const response = {
        emails: [newEmailSummary()],
        total: 1,
        hasMoreMails: false,
      };
      emailService.listEmails.mockResolvedValue(response);

      const result = await controller.list(userEmail, 'inbox');

      expect(emailService.listEmails).toHaveBeenCalledWith(
        userEmail,
        'inbox',
        20,
        0,
        undefined,
      );
      expect(result).toBe(response);
    });

    it('When list is called with limit and position, then it parses them', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'sent', '10', '5');

      expect(emailService.listEmails).toHaveBeenCalledWith(
        userEmail,
        'sent',
        10,
        5,
        undefined,
      );
    });

    it('When list is called with non-numeric strings, then it falls back to defaults', async () => {
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
