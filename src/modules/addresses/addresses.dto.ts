import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CheckAvailabilityQueryDto {
  @ApiProperty({
    description: 'Local part of the email address (before the @)',
    example: 'alice',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._%+-]+$/, {
    message: 'username contains invalid characters',
  })
  @Transform(({ value }: { value: string }) => value.toLowerCase())
  username!: string;

  @ApiProperty({ description: 'Email domain', example: 'inxt.me' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.toLowerCase())
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
