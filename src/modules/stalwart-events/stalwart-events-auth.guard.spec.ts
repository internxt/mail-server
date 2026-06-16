import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { StalwartEventsAuthGuard } from './stalwart-events-auth.guard.js';

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function createContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: authHeader },
      }),
    }),
  } as ExecutionContext;
}

describe('StalwartEventsAuthGuard', () => {
  let guard: StalwartEventsAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StalwartEventsAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'stalwartWebhook.username') return 'username';
              if (key === 'stalwartWebhook.secret') return 'secret';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    guard = module.get(StalwartEventsAuthGuard);
  });

  it('when credentials are valid, then allows access', () => {
    expect(
      guard.canActivate(createContext(basicAuth('username', 'secret'))),
    ).toBe(true);
  });

  it('when the authorization header is missing, then rejects', () => {
    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('when the authorization scheme is not Basic, then rejects', () => {
    expect(() => guard.canActivate(createContext('Bearer token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('when decoded credentials lack a colon separator, then rejects', () => {
    const malformed = `Basic ${Buffer.from('foob').toString('base64')}`;

    expect(() => guard.canActivate(createContext(malformed))).toThrow(
      UnauthorizedException,
    );
  });

  it('when the username is wrong, then rejects', () => {
    expect(() =>
      guard.canActivate(createContext(basicAuth('wrong', 'secret'))),
    ).toThrow(UnauthorizedException);
  });

  it('when the password is wrong, then rejects', () => {
    expect(() =>
      guard.canActivate(createContext(basicAuth('username', 'wrong'))),
    ).toThrow(UnauthorizedException);
  });
});
