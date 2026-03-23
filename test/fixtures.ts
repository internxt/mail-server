import Chance from 'chance';
import type {
  Mailbox,
  EmailAddress,
  EmailSummary,
  Email,
  SendEmailDto,
  DraftEmailDto,
  MailboxType,
} from '../src/modules/email/email.types.js';
import type {
  Mailbox as JmapMailbox,
  Email as JmapEmail,
  EmailAddress as JmapEmailAddress,
  MailboxRole,
  Identity,
} from '../src/modules/infrastructure/jmap/jmap.types.js';

const random = new Chance();

// ── Helpers ────────────────────────────────────────────────────────

function randomId(): string {
  return random.hash({ length: 24 });
}

function randomISODate(): string {
  return random.date({ year: 2025 }).toString();
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
