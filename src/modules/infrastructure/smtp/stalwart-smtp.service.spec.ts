/* eslint-disable @typescript-eslint/no-unsafe-return */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createMock } from '@golevelup/ts-vitest';
import { StalwartSmtpService } from './stalwart-smtp.service.js';
import { SendRateLimitedError } from '../../email/mail-provider.port.js';

const mockSendMail = vi.fn();
const mockClose = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    sendMail: mockSendMail,
    close: mockClose,
  })),
}));

import { createTransport } from 'nodemailer';

describe('StalwartSmtpService', () => {
  let service: StalwartSmtpService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const config: Record<string, string | number> = {
      'stalwart.smtpHost': 'mail-server',
      'stalwart.smtpPort': 465,
      'stalwart.masterUser': 'mail-api@inxt.me',
      'stalwart.masterPassword': 'secret',
    };

    const module = await Test.createTestingModule({
      providers: [StalwartSmtpService],
    })
      .useMocker((token) => {
        if (token === ConfigService) {
          return createMock<ConfigService>({
            getOrThrow: vi.fn((key: string) => config[key]),
          });
        }
        return createMock();
      })
      .compile();

    service = module.get(StalwartSmtpService);
  });

  describe('sendRaw', () => {
    it('When sending an email, then it connects to the configured SMTP server', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

      await service.sendRaw({
        userEmail: 'alice@inxt.me',
        to: [{ email: 'bob@external.com' }],
        subject: 'Hello',
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'mail-server',
          port: 465,
        }),
      );
    });

    it('When sending an email, then it authenticates as the sender via master-user impersonation', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

      await service.sendRaw({
        userEmail: 'alice@inxt.me',
        to: [{ email: 'bob@external.com' }],
        subject: 'Hello',
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: {
            user: 'alice@inxt.me%mail-api@inxt.me',
            pass: 'secret',
          },
        }),
      );
    });

    it('When sending an email to multiple recipients with display names, then all addresses are formatted correctly', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

      await service.sendRaw({
        userEmail: 'alice@inxt.me',
        to: [
          { name: 'Bob Smith', email: 'bob@external.com' },
          { email: 'carol@external.com' },
        ],
        subject: 'Hello',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [
            { name: 'Bob Smith', address: 'bob@external.com' },
            'carol@external.com',
          ],
        }),
      );
    });

    it('When sending an email with attachments, then the attachments are included in the message', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-2' });
      const attachment = {
        filename: 'report.pdf',
        content: Buffer.from('pdf-bytes'),
        contentType: 'application/pdf',
      };

      await service.sendRaw({
        userEmail: 'alice@inxt.me',
        to: [{ email: 'bob@external.com' }],
        subject: 'Report',
        attachments: [attachment],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ attachments: [attachment] }),
      );
    });

    it('When the email is sent successfully, then the message ID returned by the server is returned', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'unique-msg-id' });

      const result = await service.sendRaw({
        userEmail: 'alice@inxt.me',
        to: [{ email: 'bob@external.com' }],
        subject: 'Hello',
      });

      expect(result).toEqual({ messageId: 'unique-msg-id' });
    });

    it('When the SMTP server rejects the message, then the error is propagated to the caller', async () => {
      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.sendRaw({
          userEmail: 'alice@inxt.me',
          to: [{ email: 'bob@external.com' }],
          subject: 'Hello',
        }),
      ).rejects.toThrow('Connection refused');
    });

    it('When the server throttles the send, then a rate limit error is raised so the caller can ask the user to retry later', async () => {
      mockSendMail.mockRejectedValue(
        Object.assign(
          new Error(
            "Can't send mail - all recipients were rejected: 452 4.4.5 Rate limit exceeded, try again later.",
          ),
          { responseCode: 452 },
        ),
      );

      await expect(
        service.sendRaw({
          userEmail: 'alice@inxt.me',
          to: [{ email: 'bob@external.com' }],
          subject: 'Hello',
        }),
      ).rejects.toBeInstanceOf(SendRateLimitedError);
    });

    it('When only some recipients are throttled, then the per-recipient rejection is still recognized as a rate limit', async () => {
      mockSendMail.mockRejectedValue(
        Object.assign(new Error('Message failed'), {
          rejectedErrors: [
            { response: '452 4.4.5 Rate limit exceeded, try again later.' },
          ],
        }),
      );

      await expect(
        service.sendRaw({
          userEmail: 'alice@inxt.me',
          to: [{ email: 'bob@external.com' }],
          subject: 'Hello',
        }),
      ).rejects.toBeInstanceOf(SendRateLimitedError);
    });

    it('When the server rejects the message for an unrelated reason, then it is not mistaken for a rate limit', async () => {
      mockSendMail.mockRejectedValue(
        Object.assign(new Error('550 5.1.1 Unknown recipient'), {
          responseCode: 550,
        }),
      );

      await expect(
        service.sendRaw({
          userEmail: 'alice@inxt.me',
          to: [{ email: 'bob@external.com' }],
          subject: 'Hello',
        }),
      ).rejects.not.toBeInstanceOf(SendRateLimitedError);
    });

    it('When sending fails, then the connection is always closed to avoid leaks', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP error'));

      await expect(
        service.sendRaw({
          userEmail: 'alice@inxt.me',
          to: [{ email: 'bob@external.com' }],
          subject: 'Hello',
        }),
      ).rejects.toThrow();

      expect(mockClose).toHaveBeenCalled();
    });

    it('when sending a reply, then the message goes out tagged as a reply to the original so the receiver groups them in the same conversation', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'reply-1' });

      await service.sendRaw({
        userEmail: 'alice@inxt.me',
        to: [{ email: 'bob@external.com' }],
        subject: 'Re: Hello',
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<parent@example.com>',
          references: ['<root@example.com>', '<parent@example.com>'],
        }),
      );
    });
  });
});
