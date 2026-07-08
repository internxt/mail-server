import {
  type DownloadAttachmentPayload,
  type DownloadAttachmentResponse,
  type UploadAttachmentPayload,
  type UploadAttachmentResponse,
} from '../infrastructure/jmap/jmap.types.js';
import type {
  DeleteEmailResult,
  DraftEmailDto,
  Email,
  EmailListResponse,
  ListEmails,
  MailQuota,
  Mailbox,
  MailboxType,
  SearchEmailDto,
  SendEmailDto,
  ThreadingHeaders,
} from './email.types.js';

export class DraftUpdateConflictError extends Error {
  constructor(draftId: string) {
    super(`Draft ${draftId} was modified concurrently, retry the save`);
    this.name = 'DraftUpdateConflictError';
  }
}

export abstract class MailProvider {
  abstract getMailboxes(userEmail: string): Promise<Mailbox[]>;
  abstract listEmails(params: ListEmails): Promise<EmailListResponse>;
  abstract getEmail(userEmail: string, id: string): Promise<Email | null>;
  abstract getTextBodies(
    userEmail: string,
    ids: string[],
  ): Promise<Map<string, string | null>>;
  abstract sendEmail(
    userEmail: string,
    dto: SendEmailDto,
    threading?: ThreadingHeaders,
  ): Promise<{ id: string }>;
  abstract search(params: SearchEmailDto): Promise<EmailListResponse>;
  abstract saveToSent(
    userEmail: string,
    dto: SendEmailDto,
    threading?: ThreadingHeaders,
  ): Promise<{ id: string }>;
  abstract getThreadingHeaders(
    userEmail: string,
    parentId: string,
  ): Promise<ThreadingHeaders | null>;
  abstract getThread(userEmail: string, emailId: string): Promise<Email[]>;
  abstract saveDraft(userEmail: string, dto: DraftEmailDto): Promise<Email>;
  abstract updateDraft(
    userEmail: string,
    draftId: string,
    dto: DraftEmailDto,
  ): Promise<Email | null>;
  abstract getDraft(userEmail: string, id: string): Promise<Email | null>;
  abstract discardDraft(userEmail: string, id: string): Promise<void>;
  abstract moveEmail(
    userEmail: string,
    id: string,
    target: MailboxType,
  ): Promise<void>;
  abstract deleteEmail(
    userEmail: string,
    id: string,
  ): Promise<DeleteEmailResult>;
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
  abstract uploadAttachment(
    payload: UploadAttachmentPayload,
  ): Promise<UploadAttachmentResponse>;
  abstract downloadAttachment(
    payload: DownloadAttachmentPayload,
  ): Promise<DownloadAttachmentResponse>;
  abstract getQuota(userEmail: string): Promise<MailQuota>;
}
