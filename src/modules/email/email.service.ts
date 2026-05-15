import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { MailProvider } from './mail-provider.port.js';
import type {
  DraftEmailDto,
  Email,
  EmailListResponse,
  ListEmails,
  Mailbox,
  MailboxType,
  SearchEmailDto,
  SendEmailDto,
} from './email.types.js';

const ENCRYPTED_PREFIX = 'INTERNXT-ENCRYPTED-EMAIL-v1';

@Injectable()
export class EmailService {
  constructor(
    private readonly mail: MailProvider,
    private readonly accountService: AccountService,
  ) {}

  getMailboxes(userEmail: string): Promise<Mailbox[]> {
    return this.mail.getMailboxes(userEmail);
  }

  listEmails(params: ListEmails): Promise<EmailListResponse> {
    return this.mail.listEmails(params);
  }

  async getEmail(userEmail: string, id: string): Promise<Email> {
    const email = await this.mail.getEmail(userEmail, id);
    if (!email) {
      throw new NotFoundException(`Email ${id} not found`);
    }
    return email;
  }

  search(params: SearchEmailDto) {
    const hasFilter = Object.values(params.filter).some(
      (v) => v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0),
    );

    if (!hasFilter) return [];
    return this.mail.search(params);
  }

  async lookupRecipientKeys(addresses: string[]): Promise<{
    recipients: Array<{ address: string; publicKey: string | null }>;
  }> {
    const recipients =
      await this.accountService.lookupPublicKeysForAddresses(addresses);
    return { recipients };
  }

  async sendEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    if (dto.to.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    if (dto.encryption) {
      const bundle = Buffer.from(JSON.stringify(dto.encryption)).toString(
        'base64',
      );
      dto = {
        ...dto,
        textBody: `${ENCRYPTED_PREFIX}\n${bundle}`,
        htmlBody: undefined,
      };
    }

    return this.mail.sendEmail(userEmail, dto);
  }

  saveDraft(userEmail: string, dto: DraftEmailDto): Promise<{ id: string }> {
    return this.mail.saveDraft(userEmail, dto);
  }

  moveEmail(userEmail: string, id: string, target: MailboxType): Promise<void> {
    return this.mail.moveEmail(userEmail, id, target);
  }

  deleteEmail(userEmail: string, id: string): Promise<void> {
    return this.mail.deleteEmail(userEmail, id);
  }

  markAsRead(userEmail: string, id: string, read: boolean): Promise<void> {
    return this.mail.markAsRead(userEmail, id, read);
  }

  markAsFlagged(
    userEmail: string,
    id: string,
    flagged: boolean,
  ): Promise<void> {
    return this.mail.markAsFlagged(userEmail, id, flagged);
  }
}
