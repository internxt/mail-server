import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class GetMailAccountKeysDto {
  @ApiProperty({ example: 'alice@inxt.eu' })
  @IsEmail()
  address!: string;
}
