import type {
  Email as DomainEmail,
  EmailSummary,
  Mailbox as DomainMailbox,
  MailboxType,
  SendEmailDto,
  DraftEmailDto,
} from '../../email/email.types.js';
import type {
  Email as JmapEmail,
  EmailCreate as JmapEmailCreate,
  Mailbox as JmapMailbox,
  MailboxRole,
} from './jmap.types.js';

const JMAP_ROLE_TO_MAILBOX_TYPE: Record<string, MailboxType> = {
  inbox: 'inbox',
  drafts: 'drafts',
  sent: 'sent',
  trash: 'trash',
  junk: 'spam',
  archive: 'archive',
};

const MAILBOX_TYPE_TO_JMAP_ROLE: Record<MailboxType, MailboxRole> = {
  inbox: 'inbox',
  drafts: 'drafts',
  sent: 'sent',
  trash: 'trash',
  spam: 'junk',
  archive: 'archive',
};

export function mapJmapRoleToMailboxType(
  role: MailboxRole | null,
): MailboxType | null {
  if (!role) return null;
  return JMAP_ROLE_TO_MAILBOX_TYPE[role] ?? null;
}

export function mapMailboxTypeToJmapRole(type: MailboxType): MailboxRole {
  return MAILBOX_TYPE_TO_JMAP_ROLE[type];
}

export function mapJmapMailbox(m: JmapMailbox): DomainMailbox {
  return {
    id: m.id,
    name: m.name,
    type: mapJmapRoleToMailboxType(m.role),
    parentId: m.parentId,
    totalEmails: m.totalEmails,
    unreadEmails: m.unreadEmails,
  };
}

export function mapJmapEmailToSummary(e: JmapEmail): EmailSummary {
  return {
    id: e.id,
    threadId: e.threadId,
    mailboxIds: Object.keys(e.mailboxIds),
    from: e.from ?? [],
    to: e.to ?? [],
    subject: e.subject ?? '',
    receivedAt: e.receivedAt,
    preview: e.preview ?? '',
    isRead: !!e.keywords?.['$seen'],
    isFlagged: !!e.keywords?.['$flagged'],
    hasAttachment: !!e.hasAttachment,
    size: e.size,
  };
}

export function mapJmapEmailToDetail(e: JmapEmail): DomainEmail {
  const summary = mapJmapEmailToSummary(e);

  let textBody: string | null = null;
  let htmlBody: string | null = null;

  if (e.bodyValues) {
    const textPartId = e.textBody?.[0]?.partId;
    if (textPartId && e.bodyValues[textPartId]) {
      textBody = e.bodyValues[textPartId].value;
    }

    const htmlPartId = e.htmlBody?.[0]?.partId;
    if (htmlPartId && e.bodyValues[htmlPartId]) {
      htmlBody = e.bodyValues[htmlPartId].value;
    }
  }

  return {
    ...summary,
    cc: e.cc ?? [],
    bcc: e.bcc ?? [],
    replyTo: e.replyTo ?? [],
    sentAt: e.sentAt ?? null,
    textBody,
    htmlBody,
  };
}

function applyBodyParts(
  email: JmapEmailCreate,
  textBody?: string,
  htmlBody?: string,
): void {
  if (textBody) {
    email.textBody = [{ partId: 'text', type: 'text/plain' }];
    email.bodyValues = {
      text: {
        value: textBody,
        isEncodingProblem: false,
        isTruncated: false,
      },
    };
  }

  if (htmlBody) {
    email.htmlBody = [{ partId: 'html', type: 'text/html' }];
    email.bodyValues = {
      ...email.bodyValues,
      html: {
        value: htmlBody,
        isEncodingProblem: false,
        isTruncated: false,
      },
    };
  }
}

export function mapSendDtoToJmapCreate(
  dto: SendEmailDto,
  mailboxId: string,
): JmapEmailCreate {
  const email: JmapEmailCreate = {
    mailboxIds: { [mailboxId]: true },
    to: dto.to,
    subject: dto.subject,
    keywords: { $seen: true, 'app:internxt': true },
  };

  if (dto.cc) email.cc = dto.cc;
  if (dto.bcc) email.bcc = dto.bcc;
  applyBodyParts(email, dto.textBody, dto.htmlBody);

  return email;
}

export function mapDraftDtoToJmapCreate(
  dto: DraftEmailDto,
  mailboxId: string,
): JmapEmailCreate {
  const email: JmapEmailCreate = {
    mailboxIds: { [mailboxId]: true },
    keywords: { $draft: true },
  };

  if (dto.to) email.to = dto.to;
  if (dto.cc) email.cc = dto.cc;
  if (dto.bcc) email.bcc = dto.bcc;
  if (dto.subject) email.subject = dto.subject;
  applyBodyParts(email, dto.textBody, dto.htmlBody);

  return email;
}
