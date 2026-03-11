import { Injectable, Logger } from '@nestjs/common';
import { MailProvider } from '../../email/mail-provider.port.js';
import type {
  DraftEmailDto,
  Email,
  EmailListResponse,
  Mailbox,
  MailboxType,
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
} from './jmap.types.js';
import {
  mapJmapMailbox,
  mapJmapEmailToSummary,
  mapJmapEmailToDetail,
  mapJmapRoleToMailboxType,
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
  private readonly identityCache = new Map<string, TimedCache<string>>();

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

  async listEmails(
    userEmail: string,
    mailbox: MailboxType,
    limit: number,
    position: number,
  ): Promise<EmailListResponse> {
    const [accountId, mailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveMailboxId(userEmail, mailbox),
    ]);

    const response = await this.jmap.request(userEmail, [
      [
        'Email/query',
        {
          accountId,
          filter: { inMailbox: mailboxId },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit,
          position,
        },
        'r0',
      ],
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

    return {
      emails: getResult.list.map(mapJmapEmailToSummary),
      total: queryResult.total ?? 0,
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

  async sendEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    const [accountId, identityId, sentMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentityId(userEmail),
      this.resolveMailboxId(userEmail, 'sent'),
    ]);

    const emailCreate = mapSendDtoToJmapCreate(dto, sentMailboxId);

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
              identityId,
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
    const [accountId, draftsMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveMailboxId(userEmail, 'drafts'),
    ]);

    const emailCreate = mapDraftDtoToJmapCreate(dto, draftsMailboxId);

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

  private async resolveIdentityId(userEmail: string): Promise<string> {
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
      value: identity.id,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return identity.id;
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
