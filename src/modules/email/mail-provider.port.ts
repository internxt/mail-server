import { UnprocessableEntityException } from '@nestjs/common';
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
  QuotaEntryKey,
  SearchEmailDto,
  SendEmailDto,
  SendEmailResult,
  ThreadingHeaders,
  UpdateDraftResult,
} from './email.types.js';

export class DraftUpdateConflictError extends Error {
  constructor(draftId: string) {
    super(`Draft ${draftId} was modified concurrently, retry the save`);
    this.name = 'DraftUpdateConflictError';

    Object.setPrototypeOf(this, DraftUpdateConflictError.prototype);
  }
}

export class SendEmailFailedError extends Error {
  constructor(public readonly deletedEntryKey: QuotaEntryKey | null) {
    super('Failed to create email for sending');
    this.name = 'SendEmailFailedError';

    Object.setPrototypeOf(this, SendEmailFailedError.prototype);
  }
}

/**
 * The provider refused the upload because the account exhausted the upload
 * allowance of the provider's current time window. The allowance frees itself
 * when the window rolls over, so the caller may retry later.
 */
export class AttachmentUploadLimitError extends Error {
  constructor() {
    super('Attachment upload limit reached, please try again later');
    this.name = 'AttachmentUploadLimitError';

    Object.setPrototypeOf(this, AttachmentUploadLimitError.prototype);
  }
}

/**
 * The provider throttled the send because the account exhausted the sending
 * allowance of the provider's current time window. The allowance frees itself
 * when the window rolls over, so the caller may retry later.
 */
export class SendRateLimitedError extends Error {
  constructor(public readonly detail: string) {
    super('Sending rate limit reached, please try again later');
    this.name = 'SendRateLimitedError';

    Object.setPrototypeOf(this, SendRateLimitedError.prototype);
  }
}

export class MissingMessageIdError extends UnprocessableEntityException {
  constructor(parentId: string) {
    super(`Original email ${parentId} has no Message-ID; cannot thread reply`);
    this.name = 'MissingMessageIdError';

    Object.setPrototypeOf(this, MissingMessageIdError.prototype);
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
  ): Promise<SendEmailResult>;
  abstract search(params: SearchEmailDto): Promise<EmailListResponse>;
  abstract saveToSent(
    userEmail: string,
    dto: SendEmailDto,
    threading?: ThreadingHeaders,
    messageId?: string,
  ): Promise<SendEmailResult>;
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
  ): Promise<UpdateDraftResult | null>;
  abstract getDraft(userEmail: string, id: string): Promise<Email | null>;
  abstract discardDraft(
    userEmail: string,
    id: string,
  ): Promise<DeleteEmailResult>;
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
