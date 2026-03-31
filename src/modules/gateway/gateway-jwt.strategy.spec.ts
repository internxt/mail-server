import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { GatewayJwtStrategy } from './gateway-jwt.strategy.js';

describe('GatewayJwtStrategy', () => {
  let strategy: GatewayJwtStrategy;
  let configService: DeepMocked<ConfigService>;

  beforeEach(async () => {
    configService = createMock<ConfigService>();
    configService.getOrThrow.mockReturnValue(
      Buffer.from('test-secret').toString('base64'),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayJwtStrategy,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    strategy = module.get(GatewayJwtStrategy);
  });

  it('when constructed, then reads gateway secret from config', () => {
    expect(configService.getOrThrow).toHaveBeenCalledWith('secrets.gateway');
  });

  it('when validate is called, then returns true', () => {
    expect(strategy.validate()).toBe(true);
  });
});
