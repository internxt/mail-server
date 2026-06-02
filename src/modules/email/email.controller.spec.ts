import { describe, it, expect, beforeEach, test, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';
import { AccountService } from '../account/account.service.js';
import {
  newMailbox,
  newEmailSummary,
  newMailDomainAttributes,
  newUserPayload,
} from '../../../test/fixtures.js';
import type { EmailListResponse } from './email.types.js';
import { MailDomain } from '../account/domain/mail-domain.domain.js';

function makeResponse(): Response {
  return {
    setHeader: vi.fn(),
  } as unknown as Response;
}

describe('EmailController', () => {
  let controller: EmailController;
  let emailService: DeepMocked<EmailService>;
  let accountService: DeepMocked<AccountService>;
  const userEmail = newUserPayload().email;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
    })
      .useMocker(() => createMock<EmailService>())
      .compile();

    controller = module.get<EmailController>(EmailController);
    emailService = module.get(EmailService);
    accountService = module.get(AccountService);
  });

  describe('lookupRecipientKeys', () => {
    it('when called with valid addresses, then returns recipients from the service', async () => {
      const recipients = [
        { address: 'alice@internxt.me', publicKey: 'pubkey-alice' },
        { address: 'bob@external.com', publicKey: null },
      ];
      emailService.lookupRecipientKeys.mockResolvedValue({ recipients });

      const result = await controller.lookupRecipientKeys({
        addresses: ['alice@internxt.me', 'bob@external.com'],
      });

      expect(emailService.lookupRecipientKeys).toHaveBeenCalledWith([
        'alice@internxt.me',
        'bob@external.com',
      ]);
      expect(result).toEqual({ recipients });
    });
  });

  describe('getDomains', () => {
    it('when getDomains is called, then it returns the active domains', async () => {
      const domains = [
        MailDomain.build(newMailDomainAttributes()),
        MailDomain.build(newMailDomainAttributes()),
      ];
      accountService.listActiveDomains.mockResolvedValue(domains);

      const result = await controller.getDomains();

      expect(accountService.listActiveDomains).toHaveBeenCalled();
      expect(result).toBe(domains);
    });

    it('when there are no active domains, then it returns an empty array', async () => {
      accountService.listActiveDomains.mockResolvedValue([]);

      const result = await controller.getDomains();

      expect(result).toEqual([]);
    });
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

    it('When filtering by messages that are not read yet, then passes a param indicating so', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, { text: 'hello', unread: true });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello', unread: true },
      });
    });

    it('When filtering by messages that are not read yet, then passes a param indicating so', async () => {
      emailService.search.mockResolvedValue(searchResponse);

      await controller.search(userEmail, { text: 'hello', unread: false });

      expect(emailService.search).toHaveBeenCalledWith({
        userEmail,
        limit: 20,
        position: 0,
        filter: { text: 'hello', unread: false },
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

      expect(emailService.listEmails).toHaveBeenCalledWith({
        userEmail,
        mailbox: undefined,
        limit: 20,
        position: 0,
        anchorId: undefined,
        unread: undefined,
      });
      expect(result).toBe(response);
    });

    it('when called with a mailbox filter, then it filters by mailbox', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'inbox');

      expect(emailService.listEmails).toHaveBeenCalledWith({
        userEmail,
        mailbox: 'inbox',
        limit: 20,
        position: 0,
        anchorId: undefined,
        unread: undefined,
      });
    });

    it('when called with limit, position and anchorId, then it parses them', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'sent', '10', '5', 'Ma1f09b');

      expect(emailService.listEmails).toHaveBeenCalledWith({
        userEmail,
        mailbox: 'sent',
        limit: 10,
        position: 5,
        anchorId: 'Ma1f09b',
        unread: undefined,
      });
    });

    it('when called with non-numeric strings, then it falls back to defaults', async () => {
      emailService.listEmails.mockResolvedValue({
        emails: [],
        total: 0,
        hasMoreMails: false,
      });

      await controller.list(userEmail, 'inbox', 'abc', 'xyz');

      expect(emailService.listEmails).toHaveBeenCalledWith({
        userEmail,
        mailbox: 'inbox',
        limit: 20,
        position: 0,
        anchorId: undefined,
        unread: undefined,
      });
    });
  });

  describe('Uploading an attachment', () => {
    const file = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('binary'),
      size: 6,
    } as Express.Multer.File;

    test('when a user attaches a file, then the file is stored and its details are returned along with the original filename', async () => {
      emailService.uploadAttachment.mockResolvedValue({
        accountId: 'account-1',
        blobId: 'blob-1',
        size: 6,
        type: 'image/jpeg',
      });

      const result = await controller.uploadAttachment([file], userEmail);

      expect(emailService.uploadAttachment).toHaveBeenCalledWith({
        userEmail,
        blob: { buffer: file.buffer, mimeType: file.mimetype },
      });
      expect(result).toEqual({
        accountId: 'account-1',
        blobId: 'blob-1',
        size: 6,
        type: 'image/jpeg',
        name: 'photo.jpg',
      });
    });

    test('when the request does not include any file, then the upload is rejected', async () => {
      await expect(controller.uploadAttachment([], userEmail)).rejects.toThrow(
        'No files uploaded',
      );
      expect(emailService.uploadAttachment).not.toHaveBeenCalled();
    });
  });

  describe('Downloading an attachment', () => {
    test('when a user downloads an attachment, then the response carries the file bytes with the right content type, length and filename', async () => {
      const stream = Readable.from(Buffer.from('binary'));
      emailService.downloadAttachment.mockResolvedValue({
        stream,
        contentType: 'image/jpeg',
        contentLength: 1234,
      });
      const res = makeResponse();

      const result = await controller.downloadAttachment(
        userEmail,
        'email-1',
        'blob-1',
        'photo.jpg',
        'image/jpeg',
        res,
      );

      expect(emailService.downloadAttachment).toHaveBeenCalledWith({
        userEmail,
        blobId: 'blob-1',
        name: 'photo.jpg',
        type: 'image/jpeg',
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 1234);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('filename="photo.jpg"'),
      );
      expect(result.getStream()).toBe(stream);
    });

    test('when the caller does not specify a content type, then the one reported by the storage is used', async () => {
      emailService.downloadAttachment.mockResolvedValue({
        stream: Readable.from(Buffer.from('x')),
        contentType: 'application/pdf',
      });
      const res = makeResponse();

      await controller.downloadAttachment(
        userEmail,
        'email-1',
        'blob-1',
        'doc.pdf',
        undefined,
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
    });

    test('when the storage does not report a size, then no length is sent to the caller', async () => {
      emailService.downloadAttachment.mockResolvedValue({
        stream: Readable.from(Buffer.from('x')),
        contentType: 'application/octet-stream',
      });
      const res = makeResponse();

      await controller.downloadAttachment(
        userEmail,
        'email-1',
        'blob-1',
        undefined,
        undefined,
        res,
      );

      expect(res.setHeader).not.toHaveBeenCalledWith(
        'Content-Length',
        expect.anything(),
      );
    });

    test('when the caller provides a malformed content type, then it is discarded in favour of the one reported by the storage', async () => {
      emailService.downloadAttachment.mockResolvedValue({
        stream: Readable.from(Buffer.from('x')),
        contentType: 'image/png',
      });
      const res = makeResponse();

      await controller.downloadAttachment(
        userEmail,
        'email-1',
        'blob-1',
        'photo.png',
        'not a mime',
        res,
      );

      expect(emailService.downloadAttachment).toHaveBeenCalledWith({
        userEmail,
        blobId: 'blob-1',
        name: 'photo.png',
        type: undefined,
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    });
  });
});
