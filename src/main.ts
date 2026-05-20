import dotenv from 'dotenv';

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import {
  DocumentBuilder,
  type SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import { AppModule } from './app.module';
import configuration from './config/configuration';

const config = configuration();
const APP_PORT = config.port || 3100;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'internxt-version',
        'internxt-client',
      ],
      exposedHeaders: ['x-request-id'],
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
    },
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  const enableTrustProxy = config.isProduction;
  app.set('trust proxy', enableTrustProxy);
  app.set('query parser', 'extended');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.use(helmet());

  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mail API')
    .setDescription('Internxt Mail Service API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const customOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
    },
  };

  SwaggerModule.setup('docs', app, document, customOptions);
  await app.listen(APP_PORT);
  logger.log(`Application listening on port: ${APP_PORT}`);
  logger.log(`Trusting proxy enabled: ${enableTrustProxy ? 'yes' : 'no'}`);
}
void bootstrap();
