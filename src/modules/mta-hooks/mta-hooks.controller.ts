import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
  constructor(private readonly mtaHooksService: MtaHooksService) {}

  @Post('rcpt')
  @ApiOperation({
    summary: 'RCPT-stage hook',
  })
  rcpt(@Body() request: MtaHookRequest): Promise<MtaHookResponse> {
    return this.mtaHooksService.handleRcpt(request);
  }
}
