import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy.js';
import type { JwtTokenPayload } from './jwt-payload.dto.js';
import { newUserPayload } from '../../../test/fixtures.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'test-jwt-secret',
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    it('When a valid token payload is provided, then it returns the inner payload', () => {
      const userPayload = newUserPayload();
      const token: JwtTokenPayload = {
        payload: userPayload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const result = strategy.validate(token);

      expect(result).toEqual(userPayload);
    });
  });
});
