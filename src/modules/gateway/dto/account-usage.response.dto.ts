import { ApiProperty } from '@nestjs/swagger';

export class AccountUsageResponseDto {
  @ApiProperty({ example: 'f3a1b2c4-1234-4abc-9def-0123456789ab' })
  userId!: string;

  @ApiProperty({
    example: 5242880,
    description:
      'Bytes of mail storage charged to this user against the shared plan ' +
      'counter. 0 when the user has no mail account.',
  })
  usage!: number;
}
