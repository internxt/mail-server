import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class GetMailAccountKeysDto {
  @ApiPropertyOptional({
    example: 'alice@inxt.eu',
    description:
      'Address whose keys to fetch. Defaults to the caller`s primary address.',
  })
  @IsOptional()
  @IsEmail()
  address?: string;
}
