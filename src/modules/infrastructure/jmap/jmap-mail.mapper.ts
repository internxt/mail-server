import type {
  Email as DomainEmail,
  EmailAddress,
  EmailAttachment,
  EmailSummary,
  Mailbox as DomainMailbox,
  MailboxType,
  SearchEmailFilter,
  SendEmailDto,
  DraftEmailDto,
  ThreadingHeaders,
} from '../../email/email.types.js';
import type {
  Email as JmapEmail,
  EmailBodyPart,
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
    isDraft: !!e.keywords?.['$draft'],
    hasAttachment: !!e.hasAttachment,
    size: e.size,
  };
}

function mapJmapAttachments(parts?: EmailBodyPart[]): EmailAttachment[] {
  if (!parts) return [];
  return parts
    .filter((p) => p.blobId && p.disposition === 'attachment')
    .map((p) => ({
      blobId: p.blobId!,
      name: p.name ?? '',
      type: p.type ?? 'application/octet-stream',
      size: p.size ?? 0,
    }));
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
    attachments: mapJmapAttachments(e.attachments),
  };
}

export function mapSearchFilterToJmap(
  filter: SearchEmailFilter,
): Record<string, unknown> {
  const { unread, text, from, to, after, before, hasAttachment } = filter;
  return {
    ...(text && { text: `${text.trim()}*` }),
    ...(from?.length && { from: from.join(' ') }),
    ...(to?.length && { to: to.join(' ') }),
    ...(after && { after }),
    ...(before && { before }),
    ...(hasAttachment !== undefined && { hasAttachment }),
    ...(unread === true && { notKeyword: '$seen' }),
  };
}

function mapAttachmentsToJmap(attachments: EmailAttachment[]): EmailBodyPart[] {
  return attachments.map((a) => ({
    blobId: a.blobId,
    name: a.name,
    type: a.type,
    size: a.size,
    disposition: 'attachment',
  }));
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
  from: EmailAddress,
  threading?: ThreadingHeaders,
): JmapEmailCreate {
  const email: JmapEmailCreate = {
    mailboxIds: { [mailboxId]: true },
    from: [from],
    to: dto.to,
    subject: dto.subject,
    keywords: { $seen: true },
  };

  if (dto.cc) email.cc = dto.cc;
  if (dto.bcc) email.bcc = dto.bcc;
  if (dto.attachments?.length)
    email.attachments = mapAttachmentsToJmap(dto.attachments);
  if (threading) {
    email.inReplyTo = threading.messageId;
    email.references = threading.references;
  }
  applyBodyParts(email, dto.textBody, dto.htmlBody);

  return email;
}

export function mapDraftDtoToJmapCreate(
  dto: DraftEmailDto,
  mailboxId: string,
  from: EmailAddress,
): JmapEmailCreate {
  const email: JmapEmailCreate = {
    mailboxIds: { [mailboxId]: true },
    from: [from],
    keywords: { $draft: true },
  };

  if (dto.to) email.to = dto.to;
  if (dto.cc) email.cc = dto.cc;
  if (dto.bcc) email.bcc = dto.bcc;
  if (dto.subject) email.subject = dto.subject;
  if (dto.attachments?.length)
    email.attachments = mapAttachmentsToJmap(dto.attachments);
  applyBodyParts(email, dto.textBody, dto.htmlBody);

  return email;
}
