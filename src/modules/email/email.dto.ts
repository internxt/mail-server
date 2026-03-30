import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MailboxType } from './email.types.js';

export class EmailAddressDto {
  @ApiPropertyOptional({ example: 'Alice Smith' })
  name?: string;

  @ApiProperty({ example: 'alice@internxt.me' })
  email!: string;
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

export class EmailSummaryResponseDto {
  @ApiProperty({ example: 'Ma1f09b…' })
  id!: string;

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

export class EmailCreatedResponseDto {
  @ApiProperty({
    example: 'Ma1f09b…',
    description: 'ID of the created email',
  })
  id!: string;
}
