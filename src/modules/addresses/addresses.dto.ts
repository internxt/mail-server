import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsMailUsername } from '../../common/decorators/is-mail-username.decorator.js';

export class CheckAvailabilityQueryDto {
  @ApiProperty({
    description: 'Local part of the email address (before the @)',
    example: 'alice',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsMailUsername()
  username!: string;

  @ApiProperty({ description: 'Email domain', example: 'inxt.me' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  domain!: string;
}

export class CheckAvailabilityResponseDto {
  @ApiProperty({ example: false })
  available!: boolean;

  @ApiProperty({
    description:
      'Suggested address when username is taken, null when available',
    example: 'alice@inxt.me',
    type: String,
    nullable: true,
  })
  suggestion!: string | null;
}
