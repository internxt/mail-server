import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailUsecase } from './email.usecase';

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailUsecase: EmailUsecase) {}

  @Get()
  list() {
    return this.emailUsecase.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.emailUsecase.get(id);
  }
}
