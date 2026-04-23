import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class MailAddressKeyBundleDto {
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

  @ApiProperty({
    description: 'Base64-encoded Argon2id salt used to derive the keystore key',
  })
  @IsString()
  @IsNotEmpty()
  salt!: string;
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

  @ApiProperty({ type: MailAddressKeyBundleDto })
  @ValidateNested()
  @Type(() => MailAddressKeyBundleDto)
  keys!: MailAddressKeyBundleDto;
}
