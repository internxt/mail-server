import { Module } from '@nestjs/common';
import { StalwartEventsController } from './stalwart-events.controller.js';
import { StalwartEventsAuthGuard } from './stalwart-events-auth.guard.js';
import { StalwartEventsService } from './stalwart-events.service.js';

@Module({
  controllers: [StalwartEventsController],
  providers: [StalwartEventsAuthGuard, StalwartEventsService],
})
export class StalwartEventsModule {}
