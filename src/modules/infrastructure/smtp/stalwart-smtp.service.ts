import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { EmailAddress } from '../../email/email.types.js';
import { SendRateLimitedError } from '../../email/mail-provider.port.js';
import Mail from 'nodemailer/lib/mailer/index.js';

export interface SmtpAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendRawPayload {
  userEmail: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: SmtpAttachment[];
  inReplyTo?: string;
  references?: string[];
}

@Injectable()
export class StalwartSmtpService {
  private readonly logger = new Logger(StalwartSmtpService.name);
  private readonly host: string;
  private readonly port: number;
  private readonly masterUser: string;
  private readonly masterPassword: string;

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.getOrThrow<string>('stalwart.smtpHost');
    this.port = this.configService.getOrThrow<number>('stalwart.smtpPort');
    this.masterUser = this.configService.getOrThrow<string>(
      'stalwart.masterUser',
    );
    this.masterPassword = this.configService.getOrThrow<string>(
      'stalwart.masterPassword',
    );
  }

  async sendRaw(payload: SendRawPayload): Promise<{ messageId: string }> {
    const transporter = createTransport({
      host: this.host,
      port: this.port,
      secure: true,
      tls: { rejectUnauthorized: false },
      auth: {
        user: `${payload.userEmail}%${this.masterUser}`,
        pass: this.masterPassword,
      },
    });

    try {
      const { messageId } = await transporter.sendMail({
        from: payload.userEmail,
        to: formatAddresses(payload.to),
        cc: payload.cc ? formatAddresses(payload.cc) : undefined,
        bcc: payload.bcc ? formatAddresses(payload.bcc) : undefined,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
      });
      this.logger.debug(`SMTP sent for ${payload.userEmail}: ${messageId}`);
      return { messageId };
    } catch (error) {
      const limitDetail = rateLimitDetail(error);

      if (limitDetail) {
        this.logger.warn(
          `SMTP rate limit hit for ${payload.userEmail}: ${limitDetail}`,
        );
        throw new SendRateLimitedError(limitDetail);
      }

      throw error;
    } finally {
      transporter.close();
    }
  }
}

/**
 * Stalwart answers a throttled send with a transient reply carrying the 4.4.5
 * enhanced status code, e.g. `452 4.4.5 Rate limit exceeded, try again later.`
 * When every recipient is rejected nodemailer folds those replies into the
 * thrown error's message and into a per-recipient `rejectedErrors` list.
 */
const RATE_LIMIT_REPLY = /rate limit|\b4\.4\.5\b/i;

interface SmtpReplyError {
  response?: string;
  message?: string;
  rejectedErrors?: SmtpReplyError[];
}

function rateLimitDetail(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;

  const err = error as SmtpReplyError;

  for (const reply of [err, ...(err.rejectedErrors ?? [])]) {
    const text = reply.response ?? reply.message;

    if (typeof text === 'string' && RATE_LIMIT_REPLY.test(text)) return text;
  }

  return null;
}

function formatAddresses(addresses: EmailAddress[]): (string | Mail.Address)[] {
  return addresses.map((a) =>
    a.name
      ? {
          name: a.name,
          address: a.email,
        }
      : a.email,
  );
}
