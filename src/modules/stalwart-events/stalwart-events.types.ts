export type StalwartIngestEventType =
  | 'message-ingest.ham'
  | 'message-ingest.spam'
  | 'message-ingest.jmap-append'
  | 'message-ingest.imap-append'
  | 'message-ingest.duplicate';

export interface StalwartIngestEventData {
  accountId: number;
  documentId: number;
  mailboxId: number[];
  blobId: string;
  size: number;
  messageId: string;
  from: string;
  to: string[];
}

export interface StalwartEvent {
  id: string;
  createdAt: string;
  type: StalwartIngestEventType;
  data: StalwartIngestEventData;
}

export interface StalwartWebhookPayload {
  events: StalwartEvent[];
}
