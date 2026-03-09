import type {
  DraftEmailDto,
  Email,
  EmailListResponse,
  Mailbox,
  MailboxType,
  SendEmailDto,
} from './email.types.js';

export const MAIL_PROVIDER = 'MAIL_PROVIDER';

export interface MailProvider {
  getMailboxes(userEmail: string): Promise<Mailbox[]>;
  listEmails(
    userEmail: string,
    mailbox: MailboxType,
    limit: number,
    position: number,
  ): Promise<EmailListResponse>;
  getEmail(userEmail: string, id: string): Promise<Email | null>;
  sendEmail(userEmail: string, dto: SendEmailDto): Promise<{ id: string }>;
  saveDraft(userEmail: string, dto: DraftEmailDto): Promise<{ id: string }>;
  moveEmail(userEmail: string, id: string, target: MailboxType): Promise<void>;
  deleteEmail(userEmail: string, id: string): Promise<void>;
  markAsRead(userEmail: string, id: string, read: boolean): Promise<void>;
  markAsFlagged(userEmail: string, id: string, flagged: boolean): Promise<void>;
}
