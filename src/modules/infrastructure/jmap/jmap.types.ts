/**
 * JMAP types for the subset of RFC 8620 / RFC 8621 we use.
 * Based on jmap-rfc-types (MIT) — kept local to avoid build issues
 * with the package shipping raw .ts source files.
 */

export type ID = string;

// ── Session ─────────────────────────────────────────────────────────

export interface JmapSession {
  capabilities: Record<string, unknown>;
  accounts: Record<ID, JmapAccount>;
  primaryAccounts: Record<string, ID>;
  username: string;
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
  state: string;
}

export interface JmapAccount {
  name: string;
  isPersonal: boolean;
  isReadOnly: boolean;
  accountCapabilities: Record<string, unknown>;
}

// ── Request / Response ──────────────────────────────────────────────

export type JmapMethodCall = [
  method: string,
  args: Record<string, unknown>,
  id: string,
];

export type JmapInvocation<T = unknown> = [
  name: string,
  response: T,
  methodCallId: string,
];

export interface JmapRequest {
  using: string[];
  methodCalls: JmapMethodCall[];
  createdIds?: Record<ID, ID>;
}

export interface JmapResponse<T = JmapInvocation[]> {
  methodResponses: T;
  sessionState: string;
  createdIds?: Record<ID, ID>;
}

// ── Standard method responses ───────────────────────────────────────

export interface JmapGetResponse<T> {
  accountId: ID;
  state: string;
  list: T[];
  notFound: ID[];
}

export interface JmapQueryResponse {
  accountId: ID;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: ID[];
  total?: number;
}

export interface JmapSetResponse<T> {
  accountId: ID;
  oldState: string | null;
  newState: string;
  created: Record<ID, T> | null;
  updated: Record<ID, T | null> | null;
  destroyed: ID[] | null;
  notCreated: Record<ID, JmapSetError> | null;
  notUpdated: Record<ID, JmapSetError> | null;
  notDestroyed: Record<ID, JmapSetError> | null;
}

export interface JmapSetError {
  type: string;
  description?: string;
  properties?: string[];
}

// ── Mail entities (RFC 8621) ────────────────────────────────────────

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailBodyPart {
  partId?: string;
  blobId?: ID;
  size?: number;
  name?: string;
  type?: string;
  charset?: string;
  disposition?: string;
  cid?: string;
  subParts?: EmailBodyPart[];
}

export interface EmailBodyValue {
  value: string;
  isEncodingProblem: boolean;
  isTruncated: boolean;
}

export type MailboxRole =
  | 'all'
  | 'archive'
  | 'drafts'
  | 'flagged'
  | 'important'
  | 'inbox'
  | 'junk'
  | 'sent'
  | 'subscribed'
  | 'trash';

export interface Mailbox {
  id: ID;
  name: string;
  parentId: ID | null;
  role: MailboxRole | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  isSubscribed: boolean;
}

export interface Email {
  id: ID;
  blobId: ID;
  threadId: ID;
  mailboxIds: Record<ID, boolean>;
  keywords: Record<string, boolean>;
  size: number;
  receivedAt: string;
  sentAt?: string;
  from?: EmailAddress[];
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress[];
  subject?: string;
  preview?: string;
  hasAttachment?: boolean;
  textBody?: EmailBodyPart[];
  htmlBody?: EmailBodyPart[];
  attachments?: EmailBodyPart[];
  bodyValues?: Record<string, EmailBodyValue>;
}

export type EmailCreate = Partial<
  Omit<
    Email,
    'id' | 'blobId' | 'threadId' | 'size' | 'hasAttachment' | 'preview'
  >
>;

export interface UploadAttachmentResponse {
  accountId: string;
  blobId: string;
  size: number;
  type: string;
}

export interface UploadAttachmentPayload {
  userEmail: string;
  blob: {
    buffer: Buffer;
    mimeType: string;
  };
}

export interface EmailFilterCondition {
  inMailbox?: ID;
  inMailboxOtherThan?: ID[];
  before?: string;
  after?: string;
  minSize?: number;
  maxSize?: number;
  hasKeyword?: string;
  notKeyword?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  text?: string;
}

export interface Identity {
  id: ID;
  name: string;
  email: string;
  replyTo?: EmailAddress[];
  bcc?: EmailAddress[];
  textSignature: string;
  htmlSignature: string;
  mayDelete: boolean;
}

export interface EmailSubmission {
  id: ID;
  identityId: ID;
  emailId: ID;
  threadId: ID;
  sendAt: string;
  undoStatus: 'pending' | 'final' | 'canceled';
  deliveryStatus: Record<string, DeliveryStatus> | null;
}

export interface DeliveryStatus {
  smtpReply: string;
  delivered: 'queued' | 'yes' | 'no' | 'unknown';
  displayed: 'yes' | 'unknown';
}
