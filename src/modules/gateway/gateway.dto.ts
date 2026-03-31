import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

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
