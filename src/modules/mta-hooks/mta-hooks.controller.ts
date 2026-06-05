import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { MtaHooksAuthGuard } from './mta-hooks-auth.guard.js';
import { MtaHooksService } from './mta-hooks.service.js';
import type { MtaHookRequest, MtaHookResponse } from './mta-hooks.types.js';

@ApiTags('MTA Hooks')
@ApiBasicAuth('mta-hooks')
@Public()
@UseGuards(MtaHooksAuthGuard)
@Controller('mta-hooks')
export class MtaHooksController {
  private readonly logger = new Logger(MtaHooksController.name);
  constructor(private readonly mtaHooksService: MtaHooksService) {}

  @Post('data')
  @ApiOperation({
    summary: 'DATA-stage hook',
  })
  data(@Body() request: MtaHookRequest): Promise<MtaHookResponse> {
    this.logger.log({ request }, 'DATA-stage hook');
    return this.mtaHooksService.handleData(request);
  }
}
