import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SequelizeModule } from '@nestjs/sequelize';
import { LoggerModule } from 'nestjs-pino';
import { nanoid } from 'nanoid';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { JmapModule } from './modules/infrastructure/jmap/jmap.module';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HttpGlobalExceptionFilter } from './common/filters/http-global-exception.filter';

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
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        dialect: 'postgres',
        autoLoadModels: true,
        synchronize: false,
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        pool: {
          max: 20,
          min: 0,
          idle: 20000,
          acquire: 20000,
        },
        dialectOptions: configService.get('isProduction')
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
              application_name: 'mail-server',
            }
          : {},
        logging: configService.get('isDevelopment') ? console.log : false,
      }),
    }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    HealthModule,
    JmapModule,
    EmailModule,
    AuthModule,
    AccountModule,
    GatewayModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpGlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
