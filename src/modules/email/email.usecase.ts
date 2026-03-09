import { Injectable } from '@nestjs/common';
import { JmapService } from '../jmap/jmap.service.js';
import type {
  Email,
  EmailCreate,
  EmailFilterCondition,
  EmailSubmission,
  ID,
  Identity,
  JmapGetResponse,
  JmapQueryResponse,
  JmapSetResponse,
  Mailbox,
} from '../jmap/jmap.types.js';

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

@Injectable()
export class EmailUsecase {
  constructor(private readonly jmap: JmapService) {}

  async getMailboxes(userEmail: string): Promise<Mailbox[]> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<Mailbox>>(
      userEmail,
      [['Mailbox/get', { accountId }, 'r0']],
    );

    return response.methodResponses[0]![1].list;
  }

  async getEmails(
    userEmail: string,
    emailIds: ID[],
    properties: readonly string[] = EMAIL_DETAIL_PROPERTIES,
  ): Promise<Email[]> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<Email>>(
      userEmail,
      [
        [
          'Email/get',
          {
            accountId,
            ids: emailIds,
            properties,
            fetchHTMLBodyValues: true,
          },
          'r0',
        ],
      ],
    );

    return response.methodResponses[0]![1].list;
  }

  async queryEmails(
    userEmail: string,
    filter: Partial<EmailFilterCondition>,
    options?: {
      sort?: { property: string; isAscending: boolean }[];
      limit?: number;
      position?: number;
    },
  ): Promise<JmapQueryResponse> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const args: Record<string, unknown> = { accountId, filter };
    if (options?.sort) args['sort'] = options.sort;
    if (options?.limit !== undefined) args['limit'] = options.limit;
    if (options?.position !== undefined) args['position'] = options.position;

    const response = await this.jmap.request<JmapQueryResponse>(userEmail, [
      ['Email/query', args, 'r0'],
    ]);

    return response.methodResponses[0]![1];
  }

  async listEmails(
    userEmail: string,
    mailboxId: ID,
    limit = 20,
    position = 0,
  ): Promise<{ ids: ID[]; total: number; emails: Email[] }> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    // Uses back-references: r1 references r0's result
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
    const getResult = response.methodResponses[1]![1] as JmapGetResponse<Email>;

    return {
      ids: queryResult.ids,
      total: queryResult.total ?? 0,
      emails: getResult.list,
    };
  }

  async getEmailById(
    userEmail: string,
    emailId: ID,
  ): Promise<Email | undefined> {
    const emails = await this.getEmails(userEmail, [emailId]);
    return emails[0];
  }

  async setEmailKeywords(
    userEmail: string,
    emailId: ID,
    keywords: Record<string, boolean>,
  ): Promise<JmapSetResponse<Email>> {
    return this.updateEmail(userEmail, emailId, { keywords });
  }

  async moveEmail(
    userEmail: string,
    emailId: ID,
    mailboxIds: Record<ID, boolean>,
  ): Promise<JmapSetResponse<Email>> {
    return this.updateEmail(userEmail, emailId, { mailboxIds });
  }

  async destroyEmails(
    userEmail: string,
    emailIds: ID[],
  ): Promise<JmapSetResponse<Email>> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapSetResponse<Email>>(
      userEmail,
      [
        [
          'Email/set',
          {
            accountId,
            destroy: emailIds,
          },
          'r0',
        ],
      ],
    );

    return response.methodResponses[0]![1];
  }

  async sendEmail(
    userEmail: string,
    email: EmailCreate,
    identityId: ID,
  ): Promise<{
    email: JmapSetResponse<Email>;
    submission: JmapSetResponse<EmailSubmission>;
  }> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    // Two method calls in one request:
    // 1. Create the email draft
    // 2. Submit it (back-references the created draft via #draft)
    const response = await this.jmap.request(userEmail, [
      [
        'Email/set',
        {
          accountId,
          create: { draft: email },
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
          onSuccessDestroyEmail: ['#submission'],
        },
        'r1',
      ],
    ]);

    return {
      email: response.methodResponses[0]![1] as JmapSetResponse<Email>,
      submission: response
        .methodResponses[1]![1] as JmapSetResponse<EmailSubmission>,
    };
  }

  async getIdentities(userEmail: string): Promise<Identity[]> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapGetResponse<Identity>>(
      userEmail,
      [['Identity/get', { accountId }, 'r0']],
    );

    return response.methodResponses[0]![1].list;
  }

  private async updateEmail(
    userEmail: string,
    emailId: ID,
    patch: Record<string, unknown>,
  ): Promise<JmapSetResponse<Email>> {
    const accountId = await this.jmap.getPrimaryAccountId(userEmail);

    const response = await this.jmap.request<JmapSetResponse<Email>>(
      userEmail,
      [
        [
          'Email/set',
          {
            accountId,
            update: { [emailId]: patch },
          },
          'r0',
        ],
      ],
    );

    return response.methodResponses[0]![1];
  }
}
