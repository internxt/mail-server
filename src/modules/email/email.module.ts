import { Module } from '@nestjs/common';
import { JmapModule } from '../jmap/jmap.module';
import { EmailController } from './email.controller';
import { EmailUsecase } from './email.usecase';

@Module({
  imports: [JmapModule],
  controllers: [EmailController],
  providers: [EmailUsecase],
})
export class EmailModule {}
