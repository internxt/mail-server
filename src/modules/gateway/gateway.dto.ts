import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ProvisionAccountRequestDto {
  @ApiProperty({ description: 'Drive user UUID', example: 'uuid-1234' })
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
