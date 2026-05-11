import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MailAccountState } from '../domain/mail-account.domain.js';

export class MailAccountStatusResponseDto {
  @ApiProperty({ example: 'f3a1b2c4-1234-4abc-9def-0123456789ab' })
  id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'alice@inxt.eu',
    description: 'Default address of the account, null if none is set',
  })
  defaultAddress!: string | null;

  @ApiProperty({
    enum: MailAccountState,
    enumName: 'MailAccountState',
    example: MailAccountState.Active,
  })
  status!: MailAccountState;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-05-01T10:29:55.000Z',
    description: 'When the account was suspended; null when active',
  })
  suspendedAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-05-31T10:29:55.000Z',
    description:
      'Scheduled deletion date for suspended accounts; null when active',
  })
  deletionAt!: Date | null;
}

export class CreateMailAccountResponseDto {
  @ApiProperty({ example: 'f3a1b2c4-1234-4abc-9def-0123456789ab' })
  id!: string;

  @ApiProperty({ example: 'alice@inxt.eu' })
  address!: string;

  @ApiProperty({ example: 'inxt.eu' })
  domain!: string;
}

export class MailAccountKeysResponseDto {
  @ApiProperty({ example: 'alice@inxt.eu' })
  address!: string;

  @ApiProperty({
    description: 'Hybrid (X25519 + ML-KEM-768) public key, base64-encoded',
  })
  publicKey!: string;

  @ApiProperty({
    description:
      'Private key encrypted with the encryption keystore key (base64)',
  })
  encryptionPrivateKey!: string;

  @ApiProperty({
    description:
      'Private key encrypted with the recovery keystore key (base64)',
  })
  recoveryPrivateKey!: string;
}
