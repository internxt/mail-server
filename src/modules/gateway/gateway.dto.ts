import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class CheckUsernameQueryDto {
  @ApiProperty({
    description: 'Local part of the email address (before the @)',
    example: 'alice',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._%+-]+$/, {
    message: 'username contains invalid characters',
  })
  username!: string;

  @ApiProperty({ description: 'Email domain', example: 'inxt.me' })
  @IsString()
  @IsNotEmpty()
  domain!: string;
}

export class CheckUsernameResponseDto {
  @ApiProperty({ example: false })
  available!: boolean;

  @ApiProperty({
    description:
      'Suggested address when username is taken, null when available',
    example: 'alice@internxt.net',
    type: String,
    nullable: true,
  })
  suggestion!: string | null;
}

export class ProvisionAccountRequestDto {
  @ApiProperty({
    description: 'User id',
    example: 'd7ffe6b1-434d-4eae-86a5-029f76d1aa80',
  })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    description: 'Full email address',
    example: 'alice@internxt.com',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ description: 'Email domain', example: 'internxt.com' })
  @IsString()
  @IsNotEmpty()
  domain!: string;

  @ApiProperty({ description: 'User display name', example: 'Alice Smith' })
  @IsString()
  @IsNotEmpty()
  displayName!: string;
}
