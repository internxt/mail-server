import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class MailAccountKeyBundleDto {
  @ApiProperty({
    description: 'Hybrid (X25519 + ML-KEM-768) public key, base64-encoded',
  })
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @ApiProperty({
    description:
      'Private key encrypted with the encryption keystore key (base64)',
  })
  @IsString()
  @IsNotEmpty()
  encryptionPrivateKey!: string;

  @ApiProperty({
    description:
      'Private key encrypted with the recovery keystore key (base64)',
  })
  @IsString()
  @IsNotEmpty()
  recoveryPrivateKey!: string;
}

export class CreateMailAccountDto {
  @ApiProperty({ example: 'alice' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ example: 'inxt.eu' })
  @IsString()
  @IsNotEmpty()
  domain!: string;

  @ApiProperty({ example: 'Alice Smith' })
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @ApiProperty({ description: 'User password re-encrypted for mail request' })
  @IsString()
  @IsNotEmpty()
  encryptedPassword!: string;

  @ApiProperty({ type: MailAccountKeyBundleDto })
  @ValidateNested()
  @Type(() => MailAccountKeyBundleDto)
  keys!: MailAccountKeyBundleDto;
}
