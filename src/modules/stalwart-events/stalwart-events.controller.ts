import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { StalwartEventsAuthGuard } from './stalwart-events-auth.guard.js';
import { StalwartEventsService } from './stalwart-events.service.js';
import type { StalwartWebhookPayload } from './stalwart-events.types.js';

@Public()
@UseGuards(StalwartEventsAuthGuard)
@Controller()
export class StalwartEventsController {
  constructor(private readonly stalwartEventsService: StalwartEventsService) {}

  @Post('stalwart-events')
  @HttpCode(HttpStatus.OK)
  async handleEvents(@Body() body: StalwartWebhookPayload): Promise<void> {
    await this.stalwartEventsService.handleBatch(body);
  }
}
