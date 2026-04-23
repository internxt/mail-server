import type {
  DraftEmailDto,
  Email,
  EmailListResponse,
  ListEmails,
  Mailbox,
  MailboxType,
  SearchEmailFilter,
  SendEmailDto,
} from './email.types.js';

export abstract class MailProvider {
  abstract getMailboxes(userEmail: string): Promise<Mailbox[]>;
  abstract listEmails(params: ListEmails): Promise<EmailListResponse>;
  abstract getEmail(userEmail: string, id: string): Promise<Email | null>;
  abstract sendEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }>;
  abstract search(params: {
    userEmail: string;
    limit: number;
    position: number;
    filter: SearchEmailFilter;
  }): Promise<EmailListResponse>;
  abstract saveDraft(
    userEmail: string,
    dto: DraftEmailDto,
  ): Promise<{ id: string }>;
  abstract moveEmail(
    userEmail: string,
    id: string,
    target: MailboxType,
  ): Promise<void>;
  abstract deleteEmail(userEmail: string, id: string): Promise<void>;
  abstract markAsRead(
    userEmail: string,
    id: string,
    read: boolean,
  ): Promise<void>;
  abstract markAsFlagged(
    userEmail: string,
    id: string,
    flagged: boolean,
  ): Promise<void>;
}
