import { Injectable, Logger } from '@nestjs/common';
import { MailProvider } from '../../email/mail-provider.port.js';
import type {
  DraftEmailDto,
  Email,
  EmailListResponse,
  ListEmails,
  Mailbox,
  MailboxType,
  SearchEmailFilter,
  SendEmailDto,
} from '../../email/email.types.js';
import { JmapService } from './jmap.service.js';
import type {
  Email as JmapEmail,
  Identity,
  Mailbox as JmapMailbox,
  JmapGetResponse,
  JmapQueryResponse,
  JmapSetResponse,
  UploadAttachmentPayload,
  UploadAttachmentResponse,
} from './jmap.types.js';
import {
  mapJmapMailbox,
  mapJmapEmailToSummary,
  mapJmapEmailToDetail,
  mapJmapRoleToMailboxType,
  mapSearchFilterToJmap,
  mapSendDtoToJmapCreate,
  mapDraftDtoToJmapCreate,
} from './jmap-mail.mapper.js';

const EMAIL_LIST_PROPERTIES = [
  'id',
  'threadId',
  'mailboxIds',
  'from',
  'to',
  'subject',
  'receivedAt',
  'preview',
  'keywords',
  'hasAttachment',
  'size',
] as const;

const EMAIL_DETAIL_PROPERTIES = [
  ...EMAIL_LIST_PROPERTIES,
  'cc',
  'bcc',
  'replyTo',
  'sentAt',
  'textBody',
  'htmlBody',
  'bodyValues',
] as const;

interface TimedCache<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class JmapMailProvider extends MailProvider {
  private readonly logger = new Logger(JmapMailProvider.name);
  private readonly mailboxCache = new Map<
    string,
    TimedCache<Map<MailboxType, string>>
  >();
  private readonly identityCache = new Map<string, TimedCache<Identity>>();

  constructor(private readonly jmap: JmapService) {
    super();
  }

  async getMailboxes(userEmail: string): Promise<Mailbox[]> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<JmapMailbox>>(
      userEmail,
      [['Mailbox/get', { accountId }, 'r0']],
    );

    const jmapMailboxes = response.methodResponses[0]![1].list;
    this.updateMailboxCache(userEmail, jmapMailboxes);

    return jmapMailboxes.map(mapJmapMailbox);
  }

  async listEmails({
    userEmail,
    mailbox,
    anchorId,
    position,
    limit,
    unread,
  }: ListEmails): Promise<EmailListResponse> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    if (!mailbox) {
      return this.queryEmails(userEmail, accountId, limit, position, anchorId);
    }

    const unreadKeyword = unread
      ? {
          notKeyword: '$seen',
        }
      : undefined;

    const mailboxId = await this.resolveMailboxId(userEmail, mailbox);
    return this.queryEmails(userEmail, accountId, limit, position, anchorId, {
      inMailbox: mailboxId,
      ...unreadKeyword,
    });
  }

  private async queryEmails(
    userEmail: string,
    accountId: string,
    limit: number,
    position: number,
    anchorId?: string,
    filter?: Record<string, unknown>,
  ): Promise<EmailListResponse> {
    const queryParams: Record<string, unknown> = {
      accountId,
      sort: [{ property: 'receivedAt', isAscending: false }],
      limit,
      calculateTotal: true,
    };

    if (filter) {
      queryParams.filter = filter;
    }

    if (anchorId) {
      queryParams.anchor = anchorId;
      queryParams.anchorOffset = 1;
    } else {
      queryParams.position = position;
    }

    const response = await this.jmap.request(userEmail, [
      ['Email/query', queryParams, 'r0'],
      [
        'Email/get',
        {
          accountId,
          '#ids': { resultOf: 'r0', name: 'Email/query', path: '/ids' },
          properties: EMAIL_LIST_PROPERTIES,
        },
        'r1',
      ],
    ]);

    const queryResult = response.methodResponses[0]![1] as JmapQueryResponse;
    const getResult = response
      .methodResponses[1]![1] as JmapGetResponse<JmapEmail>;

    const emails = getResult.list.map(mapJmapEmailToSummary);
    const hasMoreEmails = emails.length >= limit;

    return {
      emails,
      total: queryResult.total ?? 0,
      hasMoreMails: hasMoreEmails,
      nextAnchor: hasMoreEmails ? emails.at(-1)?.id : undefined,
    };
  }

  async getEmail(userEmail: string, id: string): Promise<Email | null> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<JmapEmail>>(
      userEmail,
      [
        [
          'Email/get',
          {
            accountId,
            ids: [id],
            properties: EMAIL_DETAIL_PROPERTIES,
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
          },
          'r0',
        ],
      ],
    );

    const email = response.methodResponses[0]![1].list[0];
    return email ? mapJmapEmailToDetail(email) : null;
  }

  async getTextBodies(
    userEmail: string,
    ids: string[],
  ): Promise<Map<string, string | null>> {
    const bodies = new Map<string, string | null>();
    if (ids.length === 0) return bodies;

    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<JmapEmail>>(
      userEmail,
      [
        [
          'Email/get',
          {
            accountId,
            ids,
            properties: ['id', 'textBody', 'bodyValues'],
            fetchTextBodyValues: true,
          },
          'r0',
        ],
      ],
    );

    for (const email of response.methodResponses[0]![1].list) {
      const partId = email.textBody?.[0]?.partId;
      bodies.set(
        email.id,
        partId ? (email.bodyValues?.[partId]?.value ?? null) : null,
      );
    }

    return bodies;
  }

  async search({
    userEmail,
    limit,
    position,
    filter,
  }: {
    userEmail: string;
    limit: number;
    position: number;
    filter: SearchEmailFilter;
  }) {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    return this.queryEmails(
      userEmail,
      accountId,
      limit,
      position,
      undefined,
      mapSearchFilterToJmap(filter),
    );
  }

  async sendEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    const [accountId, identity, sentMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentity(userEmail),
      this.resolveMailboxId(userEmail, 'sent'),
    ]);

    const emailCreate = mapSendDtoToJmapCreate(dto, sentMailboxId, {
      name: identity.name,
      email: identity.email,
    });

    const response = await this.jmap.request(userEmail, [
      [
        'Email/set',
        {
          accountId,
          create: { draft: emailCreate },
        },
        'r0',
      ],
      [
        'EmailSubmission/set',
        {
          accountId,
          create: {
            submission: {
              identityId: identity.id,
              emailId: '#draft',
            },
          },
        },
        'r1',
      ],
    ]);

    const emailResult = response
      .methodResponses[0]![1] as JmapSetResponse<JmapEmail>;

    const createdId = emailResult.created?.['draft']?.id;
    if (!createdId) {
      throw new Error('Failed to create email for sending');
    }

    return { id: createdId };
  }

  async saveDraft(
    userEmail: string,
    dto: DraftEmailDto,
  ): Promise<{ id: string }> {
    const [accountId, identity, draftsMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentity(userEmail),
      this.resolveMailboxId(userEmail, 'drafts'),
    ]);

    const emailCreate = mapDraftDtoToJmapCreate(dto, draftsMailboxId, {
      name: identity.name,
      email: identity.email,
    });

    const response = await this.jmap.request<JmapSetResponse<JmapEmail>>(
      userEmail,
      [
        [
          'Email/set',
          {
            accountId,
            create: { draft: emailCreate },
          },
          'r0',
        ],
      ],
    );

    const createdId = response.methodResponses[0]![1].created?.['draft']?.id;
    if (!createdId) {
      throw new Error('Failed to save draft');
    }

    return { id: createdId };
  }

  async moveEmail(
    userEmail: string,
    id: string,
    target: MailboxType,
  ): Promise<void> {
    const [accountId, targetMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveMailboxId(userEmail, target),
    ]);

    await this.jmap.request<JmapSetResponse<JmapEmail>>(userEmail, [
      [
        'Email/set',
        {
          accountId,
          update: {
            [id]: { mailboxIds: { [targetMailboxId]: true } },
          },
        },
        'r0',
      ],
    ]);
  }

  async deleteEmail(userEmail: string, id: string): Promise<void> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<JmapEmail>>(
      userEmail,
      [
        [
          'Email/get',
          { accountId, ids: [id], properties: ['mailboxIds'] },
          'r0',
        ],
      ],
    );

    const email = response.methodResponses[0]![1].list[0];
    if (!email) return;

    const trashMailboxId = await this.resolveMailboxId(userEmail, 'trash');
    const isInTrash = !!email.mailboxIds[trashMailboxId];

    if (isInTrash) {
      await this.jmap.request<JmapSetResponse<JmapEmail>>(userEmail, [
        ['Email/set', { accountId, destroy: [id] }, 'r0'],
      ]);
    } else {
      await this.jmap.request<JmapSetResponse<JmapEmail>>(userEmail, [
        [
          'Email/set',
          {
            accountId,
            update: { [id]: { mailboxIds: { [trashMailboxId]: true } } },
          },
          'r0',
        ],
      ]);
    }
  }

  async markAsRead(
    userEmail: string,
    id: string,
    read: boolean,
  ): Promise<void> {
    return this.setKeyword(userEmail, id, '$seen', read);
  }

  async markAsFlagged(
    userEmail: string,
    id: string,
    flagged: boolean,
  ): Promise<void> {
    return this.setKeyword(userEmail, id, '$flagged', flagged);
  }

  async uploadAttachment({
    userEmail,
    blob,
  }: UploadAttachmentPayload): Promise<UploadAttachmentResponse> {
    return this.jmap.uploadAttachment({
      userEmail,
      blob: {
        name: blob.name,
        buffer: blob.buffer,
        mimeType: blob.mimeType,
      },
    });
  }

  private async setKeyword(
    userEmail: string,
    id: string,
    keyword: string,
    value: boolean,
  ): Promise<void> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    await this.jmap.request<JmapSetResponse<JmapEmail>>(userEmail, [
      [
        'Email/set',
        {
          accountId,
          update: {
            [id]: { [`keywords/${keyword}`]: value ? true : null },
          },
        },
        'r0',
      ],
    ]);
  }

  private async resolveMailboxId(
    userEmail: string,
    type: MailboxType,
  ): Promise<string> {
    const cached = this.mailboxCache.get(userEmail);
    if (cached && cached.expiresAt > Date.now()) {
      const id = cached.value.get(type);
      if (id) return id;
    }

    const accountId = await this.jmap.getPrimaryAccountId(userEmail);
    const response = await this.jmap.request<JmapGetResponse<JmapMailbox>>(
      userEmail,
      [['Mailbox/get', { accountId }, 'r0']],
    );

    const jmapMailboxes = response.methodResponses[0]![1].list;
    this.updateMailboxCache(userEmail, jmapMailboxes);

    const id = this.mailboxCache.get(userEmail)?.value.get(type);
    if (!id) {
      throw new Error(`Mailbox with role '${type}' not found`);
    }

    return id;
  }

  private async resolveIdentity(userEmail: string): Promise<Identity> {
    const cached = this.identityCache.get(userEmail);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<Identity>>(
      userEmail,
      [['Identity/get', { accountId }, 'r0']],
    );

    const identity = response.methodResponses[0]![1].list[0];
    if (!identity) {
      throw new Error('No identity found for user');
    }

    this.identityCache.set(userEmail, {
      value: identity,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return identity;
  }

  private updateMailboxCache(
    userEmail: string,
    mailboxes: JmapMailbox[],
  ): void {
    const roles = new Map<MailboxType, string>();

    for (const mb of mailboxes) {
      const type = mapJmapRoleToMailboxType(mb.role);
      if (type) {
        roles.set(type, mb.id);
      }
    }

    this.mailboxCache.set(userEmail, {
      value: roles,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}
