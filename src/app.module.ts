import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { nanoid } from 'nanoid';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { JmapModule } from './modules/jmap/jmap.module';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        name: 'mail-server',
        genReqId: () => nanoid(),
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        base: undefined,
        transport:
          process.env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: true,
                  singleLine: true,
                  levelFirst: true,
                },
              }
            : undefined,
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
        redact: ['req.headers.authorization'],
        autoLogging: false,
      },
    }),
    ConfigModule.forRoot({
      envFilePath: [`.env.${process.env.NODE_ENV}`],
      load: [configuration],
      isGlobal: true,
    }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    HealthModule,
    JmapModule,
    EmailModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
