import Chance from 'chance';
import type {
  Mailbox,
  EmailAddress,
  EmailSummary,
  Email,
  SendEmailDto,
  DraftEmailDto,
  MailboxType,
  SearchEmailDto,
  EncryptedWrappedKey,
  EncryptionBlock,
} from '../src/modules/email/email.types.js';
import type { UserPayload } from '../src/modules/auth/jwt-payload.dto.js';
import {
  type MailAccountAttributes,
  MailAccountState,
} from '../src/modules/account/domain/mail-account.domain.js';
import type { MailAddressKeysAttributes } from '../src/modules/account/domain/mail-address-keys.domain.js';
import type { MailAddressAttributes } from '../src/modules/account/domain/mail-address.domain.js';
import type { MailAddressKeyBundle } from '../src/modules/account/account.service.js';
import {
  type MailDomainAttributes,
  MailDomainStatus,
} from '../src/modules/account/domain/mail-domain.domain.js';
import type {
  CreateAccountParams,
  AccountInfo,
} from '../src/modules/account/account.types.js';
import type {
  Mailbox as JmapMailbox,
  Email as JmapEmail,
  EmailAddress as JmapEmailAddress,
  MailboxRole,
  Identity,
  JmapQuota,
} from '../src/modules/infrastructure/jmap/jmap.types.js';
import type { DeepMocked } from '@golevelup/ts-vitest';
import type { MailQuota } from '../src/modules/email/email.types.js';

export type DeepPartial<T> =
  T extends Array<infer U>
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type DeepPartialMocked<T> = DeepMocked<{
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<DeepPartial<R>>
    : T[K] extends (...args: infer A) => infer R
      ? (...args: A) => DeepPartial<R>
      : T[K];
}>;

const random = new Chance();

// ── Helpers ────────────────────────────────────────────────────────

function randomId(): string {
  return random.hash({ length: 24 });
}

function randomUuid(): string {
  return random.guid({ version: 4 });
}

function randomISODate(): string {
  return random.date({ year: 2025 }).toString();
}

export function newUserPayload(attrs?: Partial<UserPayload>): UserPayload {
  return {
    uuid: random.guid(),
    email: random.email(),
    name: random.first(),
    lastname: random.last(),
    username: random.email(),
    sharedWorkspace: false,
    networkCredentials: { user: random.hash({ length: 24 }) },
    workspaces: { owners: [] },
    ...attrs,
  };
}

// ── Domain Fixtures ────────────────────────────────────────────────

export function newEmailAddress(attrs?: Partial<EmailAddress>): EmailAddress {
  return {
    name: random.name(),
    email: random.email(),
    ...attrs,
  };
}

export function newMailbox(attrs?: Partial<Mailbox>): Mailbox {
  return {
    id: randomId(),
    name: random.word(),
    type: random.pickone<MailboxType>([
      'inbox',
      'drafts',
      'sent',
      'trash',
      'spam',
      'archive',
    ]),
    parentId: null,
    totalEmails: random.natural({ max: 500 }),
    unreadEmails: random.natural({ max: 100 }),
    ...attrs,
  };
}

export function newEmailSummary(attrs?: Partial<EmailSummary>): EmailSummary {
  return {
    id: randomId(),
    threadId: randomId(),
    mailboxIds: [randomId()],
    from: [newEmailAddress()],
    to: [newEmailAddress()],
    subject: random.sentence({ words: 5 }),
    receivedAt: randomISODate(),
    preview: random.sentence({ words: 10 }),
    isRead: random.bool(),
    isFlagged: random.bool(),
    hasAttachment: random.bool(),
    size: random.natural({ min: 100, max: 100_000 }),
    ...attrs,
    isDraft: attrs?.isDraft ?? false,
  };
}

export function newEmail(attrs?: Partial<Email>): Email {
  const summary = newEmailSummary(attrs);
  return {
    ...summary,
    cc: [],
    bcc: [],
    replyTo: [],
    sentAt: randomISODate(),
    textBody: random.paragraph(),
    htmlBody: `<p>${random.paragraph()}</p>`,
    ...attrs,
    attachments: attrs?.attachments ?? [],
  };
}

export function newEncryptedWrappedKey(
  attrs?: Partial<EncryptedWrappedKey>,
): EncryptedWrappedKey {
  return {
    hybridCiphertext: random.hash({ length: 64 }),
    encryptedKey: random.hash({ length: 64 }),
    ...attrs,
  };
}

export function newEncryptionBlock(
  attrs?: Partial<EncryptionBlock>,
): EncryptionBlock {
  return {
    version: 'v1',
    encryptedPreview: random.hash({ length: 64 }),
    encryptedText: random.hash({ length: 128 }),
    wrappedKeys: [newEncryptedWrappedKey()],
    ...attrs,
  };
}

export function newSendEmailDto(attrs?: Partial<SendEmailDto>): SendEmailDto {
  return {
    to: [newEmailAddress()],
    subject: random.sentence({ words: 5 }),
    textBody: random.paragraph(),
    ...attrs,
  };
}

export function newDraftEmailDto(
  attrs?: Partial<DraftEmailDto>,
): DraftEmailDto {
  return {
    to: [newEmailAddress()],
    subject: random.sentence({ words: 3 }),
    textBody: random.paragraph(),
    ...attrs,
  };
}

export function newMailDomainAttributes(
  attrs?: Partial<MailDomainAttributes>,
): MailDomainAttributes {
  return {
    id: randomUuid(),
    domain: random.domain(),
    status: MailDomainStatus.Active,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...attrs,
  };
}

export function newMailAddressAttributes(
  attrs?: Partial<MailAddressAttributes>,
): MailAddressAttributes {
  return {
    id: randomUuid(),
    mailAccountId: randomUuid(),
    address: random.email(),
    domainId: randomUuid(),
    isDefault: true,
    providerExternalId: random.email(),
    networkBucketId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...attrs,
  };
}

export function newMailAddressKeyBundle(
  attrs?: Partial<MailAddressKeyBundle>,
): MailAddressKeyBundle {
  return {
    publicKey: random.hash({ length: 64 }),
    encryptionPrivateKey: random.hash({ length: 128 }),
    recoveryPrivateKey: random.hash({ length: 128 }),
    ...attrs,
  };
}

export function newMailAddressKeysAttributes(
  attrs?: Partial<MailAddressKeysAttributes>,
): MailAddressKeysAttributes {
  return {
    id: randomUuid(),
    mailAddressId: randomUuid(),
    ...newMailAddressKeyBundle(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...attrs,
  };
}

export function newMailAccountAttributes(
  attrs?: Partial<MailAccountAttributes>,
): MailAccountAttributes {
  const accountId = attrs?.id ?? randomUuid();
  const address = newMailAddressAttributes({
    mailAccountId: accountId,
    ...attrs?.addresses?.[0],
    isDefault: true,
  });
  return {
    id: accountId,
    userId: randomUuid(),
    status: MailAccountState.Active,
    suspendedAt: null,
    networkBucketId: null,
    addresses: [address],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...attrs,
  };
}

export function newCreateAccountParams(
  attrs?: Partial<CreateAccountParams>,
): CreateAccountParams {
  return {
    accountId: randomUuid(),
    primaryAddress: random.email(),
    displayName: random.name(),
    password: random.hash({ length: 32 }),
    ...attrs,
  };
}

export function newAccountInfo(attrs?: Partial<AccountInfo>): AccountInfo {
  const email = random.email();
  return {
    name: email,
    displayName: random.name(),
    emails: [email],
    quota: 0,
    ...attrs,
  };
}

// ── JMAP Fixtures ──────────────────────────────────────────────────

// EmailAddress is structurally identical in both domain and JMAP types
export const newJmapEmailAddress = newEmailAddress as (
  attrs?: Partial<JmapEmailAddress>,
) => JmapEmailAddress;

export function newJmapMailbox(attrs?: Partial<JmapMailbox>): JmapMailbox {
  return {
    id: randomId(),
    name: random.word(),
    parentId: null,
    role: random.pickone<MailboxRole>([
      'inbox',
      'drafts',
      'sent',
      'trash',
      'junk',
      'archive',
    ]),
    sortOrder: random.natural({ max: 10 }),
    totalEmails: random.natural({ max: 500 }),
    unreadEmails: random.natural({ max: 100 }),
    totalThreads: random.natural({ max: 300 }),
    unreadThreads: random.natural({ max: 50 }),
    isSubscribed: random.bool(),
    ...attrs,
  };
}

export function newJmapEmail(attrs?: Partial<JmapEmail>): JmapEmail {
  const textPartId = randomId();
  const htmlPartId = randomId();

  return {
    id: randomId(),
    blobId: randomId(),
    threadId: randomId(),
    mailboxIds: { [randomId()]: true },
    keywords: {
      $seen: random.bool(),
      $flagged: random.bool(),
    },
    size: random.natural({ min: 100, max: 100_000 }),
    receivedAt: randomISODate(),
    sentAt: randomISODate(),
    from: [newJmapEmailAddress()],
    to: [newJmapEmailAddress()],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: random.sentence({ words: 5 }),
    preview: random.sentence({ words: 10 }),
    hasAttachment: random.bool(),
    textBody: [{ partId: textPartId, type: 'text/plain' }],
    htmlBody: [{ partId: htmlPartId, type: 'text/html' }],
    bodyValues: {
      [textPartId]: {
        value: random.paragraph(),
        isEncodingProblem: false,
        isTruncated: false,
      },
      [htmlPartId]: {
        value: `<p>${random.paragraph()}</p>`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    ...attrs,
  };
}

export function newJmapIdentity(attrs?: Partial<Identity>): Identity {
  return {
    id: randomId(),
    name: random.name(),
    email: random.email(),
    textSignature: '',
    htmlSignature: '',
    mayDelete: true,
    ...attrs,
  };
}

export function newSearchEmailDto(
  attrs?: Partial<SearchEmailDto>,
): SearchEmailDto {
  return {
    userEmail: random.email(),
    limit: 20,
    position: 0,
    filter: {
      text: 'hello world!',
    },
    ...attrs,
  };
}

export function newJmapQuota(attrs?: Partial<JmapQuota>): JmapQuota {
  return {
    id: randomId(),
    resourceType: 'octets',
    used: random.natural({ min: 0, max: 1_000_000_000 }),
    hardLimit: random.natural({ min: 1_000_000_000, max: 10_000_000_000 }),
    scope: 'account',
    name: 'Mail storage',
    ...attrs,
  };
}

export function newMailQuota(attrs?: Partial<MailQuota>): MailQuota {
  return {
    used: random.natural({ min: 0, max: 1_000_000_000 }),
    limit: random.natural({ min: 1_000_000_000, max: 10_000_000_000 }),
    ...attrs,
  };
}
