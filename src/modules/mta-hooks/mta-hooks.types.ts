/**
 * Types for Stalwart's MTA Hooks protocol.
 *
 * Stalwart POSTs a JSON {@link MtaHookRequest} to the configured endpoint at a
 * given SMTP stage and expects a JSON {@link MtaHookResponse} telling it whether
 * to accept or reject the message.
 *
 * We only model the fields this service reads. Unmodelled fields (client, tls,
 * sasl, server, queue, protocol, headers, ...) are still sent by Stalwart but
 * are intentionally omitted here.
 *
 * @see https://stalw.art/docs/api/mta-hooks/overview
 */

export type MtaHookStage =
  | 'connect'
  | 'ehlo'
  | 'auth'
  | 'mail'
  | 'rcpt'
  | 'data';

export interface MtaHookAddress {
  address: string;
  parameters?: Record<string, string> | null;
}

export interface MtaHookEnvelope {
  from: MtaHookAddress;
  to: MtaHookAddress[];
}

export interface MtaHookMessage {
  size: number;
}

export interface MtaHookRequest {
  context: {
    stage: MtaHookStage;
  };
  envelope?: MtaHookEnvelope;
  message?: MtaHookMessage;
}

export type MtaHookAction = 'accept' | 'reject';

export interface MtaHookSmtpResponse {
  status?: number;
  enhancedStatus?: string;
  message?: string;
}

export interface MtaHookResponse {
  action: MtaHookAction;
  response?: MtaHookSmtpResponse;
}
