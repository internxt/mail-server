import { Injectable, Logger } from '@nestjs/common';
import {
  DraftUpdateConflictError,
  MailProvider,
  MissingMessageIdError,
} from '../../email/mail-provider.port.js';
import type {
  DeleteEmailResult,
  DraftEmailDto,
  Email,
  EmailAddress,
  EmailListResponse,
  ListEmails,
  MailQuota,
  Mailbox,
  MailboxType,
  SearchEmailFilter,
  SendEmailDto,
  ThreadingHeaders,
} from '../../email/email.types.js';
import { decodeStalwartIdBig } from '../stalwart/stalwart-id.codec.js';
import {
  JMAP_QUOTA_CAPABILITIES,
  JmapError,
  JmapService,
} from './jmap.service.js';
import type {
  DownloadAttachmentPayload,
  DownloadAttachmentResponse,
  Email as JmapEmail,
  Identity,
  JmapQuota,
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
  'attachments',
] as const;

interface TimedCache<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

const UPDATE_DRAFT_MAX_ATTEMPTS = 3;

const isStateMismatchError = (err: unknown): boolean =>
  err instanceof JmapError &&
  Array.isArray(err.details) &&
  err.details.some(
    (invocation) =>
      Array.isArray(invocation) &&
      (invocation[1] as { type?: string } | null)?.type === 'stateMismatch',
  );

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

    const unreadKeyword = unread ? { notKeyword: '$seen' } : undefined;

    const mailboxFilter = mailbox
      ? { inMailbox: await this.resolveMailboxId(userEmail, mailbox) }
      : undefined;

    const filter =
      mailboxFilter || unreadKeyword
        ? { ...mailboxFilter, ...unreadKeyword }
        : undefined;

    if (mailbox === 'drafts') {
      return this.queryEmails(
        userEmail,
        accountId,
        limit,
        position,
        anchorId,
        filter,
      );
    }

    return this.queryEmailsCollapsedByThread(
      userEmail,
      accountId,
      limit,
      position,
      anchorId,
      filter,
    );
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

  private async queryEmailsCollapsedByThread(
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
      collapseThreads: true,
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
      [
        'Thread/get',
        {
          accountId,
          '#ids': {
            resultOf: 'r1',
            name: 'Email/get',
            path: '/list/*/threadId',
          },
        },
        'r2',
      ],
      [
        'Email/get',
        {
          accountId,
          '#ids': {
            resultOf: 'r2',
            name: 'Thread/get',
            path: '/list/*/emailIds',
          },
          properties: ['id', 'threadId', 'from', 'receivedAt'],
        },
        'r3',
      ],
    ]);

    const queryResult = response.methodResponses[0]![1] as JmapQueryResponse;
    const representatives = (
      response.methodResponses[1]![1] as JmapGetResponse<JmapEmail>
    ).list;
    const threadEmails = (
      response.methodResponses[3]![1] as JmapGetResponse<JmapEmail>
    ).list;

    const emailsByThread = new Map<string, JmapEmail[]>();
    for (const e of threadEmails) {
      const bucket = emailsByThread.get(e.threadId) ?? [];
      bucket.push(e);
      emailsByThread.set(e.threadId, bucket);
    }

    const emails = representatives.map((rep) => {
      const summary = mapJmapEmailToSummary(rep);
      const thread = emailsByThread.get(rep.threadId) ?? [rep];
      return {
        ...summary,
        threadSize: thread.length,
        lastReceivedAt: thread.reduce(
          (latest, e) => (e.receivedAt > latest ? e.receivedAt : latest),
          thread[0]!.receivedAt,
        ),
        participants: uniqueParticipants(thread),
      };
    });

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
    threading?: ThreadingHeaders,
  ): Promise<{ id: string }> {
    const [accountId, identity, sentMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentity(userEmail),
      this.resolveMailboxId(userEmail, 'sent'),
    ]);

    const emailCreate = mapSendDtoToJmapCreate(
      dto,
      sentMailboxId,
      { name: identity.name, email: identity.email },
      threading,
    );

    const response = await this.jmap.request(userEmail, [
      [
        'Email/set',
        {
          accountId,
          create: { draft: emailCreate },
          ...(dto.draftId && { destroy: [dto.draftId] }),
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

  private async destroyDraft(
    userEmail: string,
    accountId: string,
    draftId: string,
  ): Promise<void> {
    try {
      const response = await this.jmap.request<JmapSetResponse<JmapEmail>>(
        userEmail,
        [['Email/set', { accountId, destroy: [draftId] }, 'r0']],
      );
      const notDestroyed =
        response.methodResponses[0]![1].notDestroyed?.[draftId];
      if (notDestroyed) {
        this.logger.warn(
          `Could not destroy draft ${draftId} after sending: ${notDestroyed.description ?? notDestroyed.type}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to destroy draft ${draftId} after sending: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async saveToSent(
    userEmail: string,
    dto: SendEmailDto,
    threading?: ThreadingHeaders,
    messageId?: string,
  ): Promise<{ id: string }> {
    const [accountId, identity, sentMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentity(userEmail),
      this.resolveMailboxId(userEmail, 'sent'),
    ]);

    const emailCreate = mapSendDtoToJmapCreate(
      dto,
      sentMailboxId,
      { name: identity.name, email: identity.email },
      threading,
      messageId,
    );

    const response = await this.jmap.request<JmapSetResponse<JmapEmail>>(
      userEmail,
      [
        [
          'Email/set',
          {
            accountId,
            create: { sent: emailCreate },
          },
          'r0',
        ],
      ],
    );

    const createdId = response.methodResponses[0]![1].created?.['sent']?.id;
    if (!createdId) {
      throw new Error('Failed to save email to Sent');
    }

    if (dto.draftId) {
      await this.destroyDraft(userEmail, accountId, dto.draftId);
    }

    return { id: createdId };
  }

  async getThreadingHeaders(
    userEmail: string,
    parentId: string,
  ): Promise<ThreadingHeaders | null> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<JmapEmail>>(
      userEmail,
      [
        [
          'Email/get',
          {
            accountId,
            ids: [parentId],
            properties: [
              'id',
              'messageId',
              'inReplyTo',
              'references',
              'subject',
              'from',
              'replyTo',
              'to',
              'cc',
            ],
          },
          'r0',
        ],
      ],
    );

    const parent = response.methodResponses[0]![1].list[0];
    if (!parent) return null;

    const messageId = parent.messageId ?? [];
    const isMessageIdEmpty = messageId.length === 0;

    if (isMessageIdEmpty) {
      throw new MissingMessageIdError(parentId);
    }

    const seen = new Set<string>();
    const references: string[] = [];
    for (const ref of [
      ...(parent.references ?? []),
      ...(parent.inReplyTo ?? []),
      ...messageId,
    ]) {
      if (!seen.has(ref)) {
        seen.add(ref);
        references.push(ref);
      }
    }

    return {
      messageId,
      references,
      parentSubject: parent.subject ?? '',
      parentFrom: parent.from ?? [],
      parentReplyTo: parent.replyTo ?? [],
      parentTo: parent.to ?? [],
      parentCc: parent.cc ?? [],
    };
  }

  async getThread(userEmail: string, emailId: string): Promise<Email[]> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request(userEmail, [
      [
        'Email/get',
        {
          accountId,
          ids: [emailId],
          properties: ['id', 'threadId'],
        },
        'r0',
      ],
      [
        'Thread/get',
        {
          accountId,
          '#ids': {
            resultOf: 'r0',
            name: 'Email/get',
            path: '/list/*/threadId',
          },
        },
        'r1',
      ],
      [
        'Email/get',
        {
          accountId,
          '#ids': {
            resultOf: 'r1',
            name: 'Thread/get',
            path: '/list/*/emailIds',
          },
          properties: [...EMAIL_DETAIL_PROPERTIES, 'messageId'],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
        },
        'r2',
      ],
    ]);

    const firstLookup = response
      .methodResponses[0]![1] as JmapGetResponse<JmapEmail>;
    if (firstLookup.list.length === 0) return [];

    const emailsResult = response
      .methodResponses[2]![1] as JmapGetResponse<JmapEmail>;

    const inboxMailboxId = await this.resolveMailboxId(userEmail, 'inbox');

    return dedupeByMessageId(emailsResult.list, inboxMailboxId)
      .map(mapJmapEmailToDetail)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async saveDraft(userEmail: string, dto: DraftEmailDto): Promise<Email> {
    const [accountId, identity, draftsMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentity(userEmail),
      this.resolveMailboxId(userEmail, 'drafts'),
    ]);

    const emailCreate = mapDraftDtoToJmapCreate(dto, draftsMailboxId, {
      name: identity.name,
      email: identity.email,
    });

    const setResponse = await this.jmap.request<JmapSetResponse<JmapEmail>>(
      userEmail,
      [['Email/set', { accountId, create: { draft: emailCreate } }, 'r0']],
    );

    const createdId = setResponse.methodResponses[0]![1].created?.['draft']?.id;
    if (!createdId) {
      throw new Error('Failed to save draft');
    }

    const savedDraft = await this.getEmail(userEmail, createdId);
    if (!savedDraft) {
      throw new Error('Failed to fetch the created draft');
    }

    return savedDraft;
  }

  async updateDraft(
    userEmail: string,
    draftId: string,
    dto: DraftEmailDto,
  ): Promise<Email | null> {
    const [accountId, identity, draftsMailboxId] = await Promise.all([
      this.jmap.getPrimaryAccountId(userEmail),
      this.resolveIdentity(userEmail),
      this.resolveMailboxId(userEmail, 'drafts'),
    ]);

    const emailCreate = mapDraftDtoToJmapCreate(dto, draftsMailboxId, {
      name: identity.name,
      email: identity.email,
    });

    for (let attempt = 1; attempt <= UPDATE_DRAFT_MAX_ATTEMPTS; attempt++) {
      const getResponse = await this.jmap.request<JmapGetResponse<JmapEmail>>(
        userEmail,
        [
          [
            'Email/get',
            { accountId, ids: [draftId], properties: ['id', 'keywords'] },
            'r0',
          ],
        ],
      );

      const getResult = getResponse.methodResponses[0]![1];
      const existing = getResult.list[0];
      if (!existing?.keywords?.['$draft']) {
        return null;
      }

      let setResult: JmapSetResponse<JmapEmail>;
      try {
        const setResponse = await this.jmap.request<JmapSetResponse<JmapEmail>>(
          userEmail,
          [
            [
              'Email/set',
              {
                accountId,
                ifInState: getResult.state,
                destroy: [draftId],
                create: { draft: emailCreate },
              },
              'r0',
            ],
          ],
        );
        setResult = setResponse.methodResponses[0]![1];
      } catch (err) {
        if (isStateMismatchError(err)) {
          if (attempt < UPDATE_DRAFT_MAX_ATTEMPTS) continue;
          throw new DraftUpdateConflictError(draftId);
        }
        throw err;
      }

      const createdId = setResult.created?.['draft']?.id;

      if (setResult.notDestroyed?.[draftId]) {
        if (createdId) {
          await this.jmap
            .request(userEmail, [
              ['Email/set', { accountId, destroy: [createdId] }, 'r0'],
            ])
            .catch((cleanupErr) => {
              this.logger.warn(
                `Failed to clean up recreated draft ${createdId} after a partial update: ${
                  cleanupErr instanceof Error
                    ? cleanupErr.message
                    : String(cleanupErr)
                }`,
              );
            });
        }
        throw new Error(
          `Failed to update draft: ${setResult.notDestroyed[draftId].description}`,
        );
      }

      if (setResult.notCreated?.['draft']) {
        throw new Error(
          `Failed to update draft: ${setResult.notCreated['draft'].description}`,
        );
      }

      if (!createdId) {
        throw new Error('Failed to recreate draft after destroy');
      }

      const updatedDraft = await this.getEmail(userEmail, createdId);
      if (!updatedDraft) {
        throw new Error('Failed to fetch the updated draft');
      }

      return updatedDraft;
    }

    throw new DraftUpdateConflictError(draftId);
  }

  async discardDraft(userEmail: string, id: string): Promise<void> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);
    const response = await this.jmap.request<JmapSetResponse<JmapEmail>>(
      userEmail,
      [['Email/set', { accountId, destroy: [id] }, 'r0']],
    );
    const notDestroyed = response.methodResponses[0]![1].notDestroyed?.[id];
    if (notDestroyed) {
      throw new Error(
        `Failed to discard draft ${id}: ${notDestroyed.description ?? notDestroyed.type}`,
      );
    }
  }

  async getDraft(userEmail: string, id: string): Promise<Email | null> {
    const email = await this.getEmail(userEmail, id);
    if (!email?.isDraft) return null;
    return email;
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

  async deleteEmail(userEmail: string, id: string): Promise<DeleteEmailResult> {
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
    if (!email) return { deletedEntryKey: null };

    const trashMailboxId = await this.resolveMailboxId(userEmail, 'trash');
    const isInTrash = !!email.mailboxIds[trashMailboxId];

    if (isInTrash) {
      await this.jmap.request<JmapSetResponse<JmapEmail>>(userEmail, [
        ['Email/set', { accountId, destroy: [id] }, 'r0'],
      ]);

      return { deletedEntryKey: this.buildEntryKey(accountId, id) };
    }

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

    return { deletedEntryKey: null };
  }

  private buildEntryKey(accountId: string, emailId: string): string {
    const numericAccountId = decodeStalwartIdBig(accountId) & 0xffffffffn;
    const documentId = decodeStalwartIdBig(emailId) & 0xffffffffn;
    return `${numericAccountId}:${documentId}`;
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

  async downloadAttachment(
    payload: DownloadAttachmentPayload,
  ): Promise<DownloadAttachmentResponse> {
    return this.jmap.downloadAttachment(payload);
  }

  async getQuota(userEmail: string): Promise<MailQuota> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<JmapQuota>>(
      userEmail,
      [['Quota/get', { accountId }, 'r0']],
      JMAP_QUOTA_CAPABILITIES,
    );

    const quotas = response.methodResponses[0]![1].list;
    const bytesQuota = quotas.find((q) => q.resourceType === 'octets');

    return {
      used: bytesQuota?.used ?? 0,
      limit: bytesQuota?.hardLimit ?? 0,
    };
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

function dedupeByMessageId(
  emails: JmapEmail[],
  inboxMailboxId: string,
): JmapEmail[] {
  const byMessageId = new Map<string, JmapEmail>();
  const result: JmapEmail[] = [];

  for (const email of emails) {
    const messageId = email.messageId?.[0]?.trim().toLowerCase();
    if (!messageId) {
      result.push(email);
      continue;
    }

    const existing = byMessageId.get(messageId);
    if (!existing) {
      byMessageId.set(messageId, email);
      result.push(email);
      continue;
    }

    const isExistingInInbox = !!existing.mailboxIds[inboxMailboxId];
    const isCandidateInInbox = !!email.mailboxIds[inboxMailboxId];
    if (isCandidateInInbox && !isExistingInInbox) {
      const index = result.indexOf(existing);
      result[index] = email;
      byMessageId.set(messageId, email);
    }
  }

  return result;
}

function uniqueParticipants(thread: JmapEmail[]): EmailAddress[] {
  const sorted = [...thread].sort((a, b) =>
    a.receivedAt.localeCompare(b.receivedAt),
  );
  const seen = new Set<string>();
  const result: EmailAddress[] = [];
  for (const email of sorted) {
    for (const addr of email.from ?? []) {
      const key = addr.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ name: addr.name, email: addr.email });
    }
  }
  return result;
}
