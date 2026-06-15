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

export type MailDeliveryMode = 'INTERNXT' | 'EXTERNAL';

export interface EncryptedSummaryFields {
  encryptedPreview: string;
  wrappedKeys: EncryptedWrappedKey[];
  attachmentWrappedKeys?: EncryptedWrappedKey[];
}

export interface EmailSummary {
  id: string;
  threadId: string;
  mailboxIds: string[];
  from: EmailAddress[];
  to: EmailAddress[];
  subject: string;
  receivedAt: string;
  preview: string;
  isRead: boolean;
  isFlagged: boolean;
  hasAttachment: boolean;
  size: number;
  encryption?: EncryptedSummaryFields | null;
}

export interface EmailAttachment {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface Email extends EmailSummary {
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];
  sentAt: string | null;
  textBody: string | null;
  htmlBody: string | null;
  attachments: EmailAttachment[];
}

export interface ListEmails {
  userEmail: string;
  mailbox?: MailboxType;
  limit: number;
  position: number;
  anchorId?: string;
  unread?: boolean;
}

export interface EncryptedWrappedKey {
  hybridCiphertext: string;
  encryptedKey: string;
}

export interface EncryptionBlock {
  version: 'v1';
  encryptedPreview: string;
  encryptedText: string;
  wrappedKeys: EncryptedWrappedKey[];
  attachmentWrappedKeys?: EncryptedWrappedKey[];
}

export interface SendEmailDto {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  encryption?: EncryptionBlock;
  attachments?: EmailAttachment[];
  inReplyToEmailId?: string;
}

export interface ThreadingHeaders {
  messageId: string[];
  references: string[];
}

export interface DraftEmailDto {
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
}

export interface SearchEmailDto {
  userEmail: string;
  limit: number;
  position: number;
  filter: SearchEmailFilter;
}

export interface EmailListResponse {
  emails: EmailSummary[];
  total: number;
  hasMoreMails: boolean;
  nextAnchor?: string;
}

export interface SearchEmailFilter {
  after?: string;
  before?: string;
  text?: string;
  from?: string[];
  to?: string[];
  unread?: boolean;
  hasAttachment?: boolean;
}
