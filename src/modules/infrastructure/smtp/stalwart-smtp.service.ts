import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { EmailAddress } from '../../email/email.types.js';
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
      });
      this.logger.debug(`SMTP sent for ${payload.userEmail}: ${messageId}`);
      return { messageId };
    } finally {
      transporter.close();
    }
  }
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
