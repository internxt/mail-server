export type MailboxType =
  | 'inbox'
  | 'drafts'
  | 'sent'
  | 'trash'
  | 'spam'
  | 'archive';

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Mailbox {
  id: string;
  name: string;
  type: MailboxType | null;
  parentId: string | null;
  totalEmails: number;
  unreadEmails: number;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: EmailAddress[];
  to: EmailAddress[];
  subject: string;
  receivedAt: string;
  preview: string;
  isRead: boolean;
  isFlagged: boolean;
  hasAttachment: boolean;
  size: number;
}

export interface Email extends EmailSummary {
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];
  sentAt: string | null;
  textBody: string | null;
  htmlBody: string | null;
}

export interface SendEmailDto {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
}

export interface DraftEmailDto {
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
}

export interface EmailListResponse {
  emails: EmailSummary[];
  total: number;
}
