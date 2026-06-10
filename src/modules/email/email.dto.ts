import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail } from 'class-validator';
import type { MailboxType, MailDeliveryMode } from './email.types.js';
import { MailDomainStatus } from '../account/domain/mail-domain.domain.js';

export class MailDomainDto {
  @ApiProperty({ type: String, example: 'f3a1b2c4-…' })
  id!: string;

  @ApiProperty({ type: String, example: 'active' })
  status!: MailDomainStatus;

  @ApiProperty({ type: String, example: 'internxt.me' })
  domain!: string;

  @ApiProperty({
    type: String,
    example: '2025-06-15T10:29:55Z',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    example: '2025-06-15T10:29:55Z',
  })
  updatedAt!: Date;
}

export class EmailAddressDto {
  @ApiPropertyOptional({ example: 'Alice Smith' })
  name?: string;

  @ApiProperty({ example: 'alice@internxt.me' })
  email!: string;
}

export class EncryptedWrappedKeyDto {
  @ApiProperty({ description: 'Hybrid ciphertext (base64)' })
  hybridCiphertext!: string;

  @ApiProperty({ description: 'Encrypted symmetric key (base64)' })
  encryptedKey!: string;
}

export class EncryptionBlockDto {
  @ApiProperty({ example: 'v1' })
  version!: 'v1';

  @ApiProperty({
    description: 'Encrypted preview snippet (base64), ~256 chars plaintext',
  })
  encryptedPreview!: string;

  @ApiProperty({ description: 'Encrypted text body (base64)' })
  encryptedText!: string;

  @ApiProperty({
    type: [EncryptedWrappedKeyDto],
    description: 'De-identified wrapped keys, one per recipient',
  })
  wrappedKeys!: EncryptedWrappedKeyDto[];

  @ApiProperty({
    type: [EncryptedWrappedKeyDto],
    description: 'De-identified attachment wrapped keys, one per recipient',
  })
  attachmentWrappedKeys!: EncryptedWrappedKeyDto[];
}

export class AttachmentRefDto {
  @ApiProperty({ example: 'T1a2b3c…' })
  blobId!: string;

  @ApiProperty({ example: 'photo.jpg' })
  name!: string;

  @ApiProperty({ example: 'image/jpeg' })
  type!: string;

  @ApiProperty({ example: 4096, description: 'Size in bytes' })
  size!: number;
}

export class SendEmailRequestDto {
  @ApiProperty({
    type: [EmailAddressDto],
    description: 'Primary recipients (at least one required)',
  })
  to!: EmailAddressDto[];

  @ApiPropertyOptional({ type: [EmailAddressDto] })
  cc?: EmailAddressDto[];

  @ApiPropertyOptional({ type: [EmailAddressDto] })
  bcc?: EmailAddressDto[];

  @ApiProperty({ example: 'Weekly sync notes' })
  subject!: string;

  @ApiPropertyOptional({
    example: 'Hi team, here are the notes from today…',
    description: 'Plain-text version of the email body',
  })
  textBody?: string;

  @ApiPropertyOptional({
    example: '<p>Hi team, here are the notes from today…</p>',
    description: 'HTML version of the email body',
  })
  htmlBody?: string;

  @ApiPropertyOptional({ type: EncryptionBlockDto })
  encryption?: EncryptionBlockDto;

  @ApiPropertyOptional({ type: [AttachmentRefDto] })
  attachments?: AttachmentRefDto[];

  @ApiPropertyOptional({ enum: ['INTERNXT', 'EXTERNAL'], example: 'INTERNXT' })
  deliveryMode?: MailDeliveryMode;
}

export class LookupRecipientKeysRequestDto {
  @ApiProperty({
    type: [String],
    description: '1-50 email addresses to look up',
    example: ['alice@internxt.me', 'bob@internxt.com'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  addresses!: string[];
}

export class RecipientKeyDto {
  @ApiProperty({ example: 'alice@internxt.me' })
  address!: string;

  @ApiProperty({
    example: 'base64encodedpublickey==',
    nullable: true,
    type: String,
  })
  publicKey!: string | null;
}

export class LookupRecipientKeysResponseDto {
  @ApiProperty({ type: [RecipientKeyDto] })
  recipients!: RecipientKeyDto[];
}

export class DraftEmailRequestDto {
  @ApiPropertyOptional({ type: [EmailAddressDto] })
  to?: EmailAddressDto[];

  @ApiPropertyOptional({ type: [EmailAddressDto] })
  cc?: EmailAddressDto[];

  @ApiPropertyOptional({ type: [EmailAddressDto] })
  bcc?: EmailAddressDto[];

  @ApiPropertyOptional({ example: 'Draft: project update' })
  subject?: string;

  @ApiPropertyOptional({ example: 'Still working on this…' })
  textBody?: string;

  @ApiPropertyOptional({ example: '<p>Still working on this…</p>' })
  htmlBody?: string;

  @ApiPropertyOptional({ type: [AttachmentRefDto] })
  attachments?: AttachmentRefDto[];
}

export class UpdateEmailRequestDto {
  @ApiPropertyOptional({
    enum: ['inbox', 'drafts', 'sent', 'trash', 'spam', 'archive'],
    description: 'Move the email to this mailbox',
    example: 'trash',
  })
  mailbox?: MailboxType;

  @ApiPropertyOptional({
    description: 'Mark the email as read or unread',
    example: true,
  })
  isRead?: boolean;

  @ApiPropertyOptional({
    description: 'Flag or unflag the email',
    example: false,
  })
  isFlagged?: boolean;
}

export class MailboxResponseDto {
  @ApiProperty({ example: 'f3a1b2c4-…' })
  id!: string;

  @ApiProperty({ example: 'Inbox' })
  name!: string;

  @ApiProperty({
    enum: ['inbox', 'drafts', 'sent', 'trash', 'spam', 'archive'],
    nullable: true,
    example: 'inbox',
  })
  type!: MailboxType | null;

  @ApiProperty({ nullable: true, example: null })
  parentId!: string | null;

  @ApiProperty({ example: 142 })
  totalEmails!: number;

  @ApiProperty({ example: 3 })
  unreadEmails!: number;
}

export class EncryptedSummaryDto {
  @ApiProperty({ description: 'Encrypted preview snippet (base64)' })
  encryptedPreview!: string;

  @ApiProperty({
    type: [EncryptedWrappedKeyDto],
    description:
      'De-identified wrapped keys; the client trial-decrypts to read',
  })
  wrappedKeys!: EncryptedWrappedKeyDto[];

  @ApiPropertyOptional({
    type: [EncryptedWrappedKeyDto],
    description:
      'De-identified wrapped keys for the symmetric key that encrypts the ' +
      "email's attachments. Present only when the email has encrypted attachments.",
  })
  attachmentWrappedKeys?: EncryptedWrappedKeyDto[];
}

export class EmailSummaryResponseDto {
  @ApiProperty({ example: 'Ma1f09b…' })
  id!: string;

  @ApiProperty({ type: [String], example: ['d', 'a'] })
  mailboxIds!: string[];

  @ApiProperty({ example: 'T1a2b3c…' })
  threadId!: string;

  @ApiProperty({ type: [EmailAddressDto] })
  from!: EmailAddressDto[];

  @ApiProperty({ type: [EmailAddressDto] })
  to!: EmailAddressDto[];

  @ApiProperty({ example: 'Weekly sync notes' })
  subject!: string;

  @ApiProperty({ example: '2025-06-15T10:30:00Z' })
  receivedAt!: string;

  @ApiProperty({ example: 'Hi team, here are the notes from…' })
  preview!: string;

  @ApiProperty({ example: true })
  isRead!: boolean;

  @ApiProperty({ example: false })
  isFlagged!: boolean;

  @ApiProperty({ example: false })
  hasAttachment!: boolean;

  @ApiProperty({ example: 4096, description: 'Size in bytes' })
  size!: number;

  @ApiPropertyOptional({
    type: EncryptedSummaryDto,
    nullable: true,
    description:
      'Present only for encrypted emails. Carries the encrypted preview and ' +
      'the de-identified wrapped keys for inline client-side decryption.',
  })
  encryption?: EncryptedSummaryDto | null;
}

export class EmailAttachmentDto {
  @ApiProperty({ example: 'T1a2b3c…' })
  blobId!: string;

  @ApiProperty({ example: 'photo.jpg' })
  name!: string;

  @ApiProperty({ example: 'image/jpeg' })
  type!: string;

  @ApiProperty({ example: 4096, description: 'Size in bytes' })
  size!: number;
}

export class EmailResponseDto extends EmailSummaryResponseDto {
  @ApiProperty({ type: [EmailAddressDto] })
  cc!: EmailAddressDto[];

  @ApiProperty({ type: [EmailAddressDto] })
  bcc!: EmailAddressDto[];

  @ApiProperty({ type: [EmailAddressDto] })
  replyTo!: EmailAddressDto[];

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2025-06-15T10:29:55Z',
  })
  sentAt!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Hi team, here are the notes…',
  })
  textBody!: string | null;

  @ApiProperty({
    nullable: true,
    example: '<p>Hi team, here are the notes…</p>',
    type: String,
  })
  htmlBody!: string | null;

  @ApiProperty({ type: [EmailAttachmentDto] })
  attachments!: EmailAttachmentDto[];
}

export class EmailListResponseDto {
  @ApiProperty({ type: [EmailSummaryResponseDto] })
  emails!: EmailSummaryResponseDto[];

  @ApiProperty({ example: 142, description: 'Total emails in the mailbox' })
  total!: number;

  @ApiProperty({
    example: true,
    description: 'Whether there are more emails to fetch',
  })
  hasMoreMails!: boolean;

  @ApiPropertyOptional({ example: 'Ma1f09b…' })
  nextAnchor?: string;
}

export class SearchEmailQueryDto {
  @ApiPropertyOptional({ description: 'Full-text search' })
  text?: string;

  @ApiPropertyOptional({ example: 20 })
  limit?: number;

  @ApiPropertyOptional({ example: 0 })
  position?: number;

  @ApiPropertyOptional({
    description: 'Filter by sender',
    example: ['a@inxt.eu', 'b@inxt.me'],
  })
  from?: string[];

  @ApiPropertyOptional({
    description: 'Filter by recipient',
    example: ['a@inxt.eu', 'b@inxt.me'],
  })
  to?: string[];

  @ApiPropertyOptional({
    description: 'ISO 8601 date — emails received after this date',
  })
  after?: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 date — emails received before this date',
  })
  before?: string;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  unread?: boolean;

  @ApiPropertyOptional({ description: 'Filter by attachment presence' })
  hasAttachment?: boolean;
}

export class EmailCreatedResponseDto {
  @ApiProperty({
    example: 'Ma1f09b…',
    description: 'ID of the created email',
  })
  id!: string;
}

export class UploadAttachmentResponseDto {
  @ApiProperty({ example: 'T1a2b3c…' })
  blobId!: string;

  @ApiProperty({ example: 4096, description: 'Size in bytes' })
  size!: number;

  @ApiProperty({ example: 'image/jpeg' })
  type!: string;

  @ApiProperty({ example: 'photo.jpg' })
  name!: string;
}
