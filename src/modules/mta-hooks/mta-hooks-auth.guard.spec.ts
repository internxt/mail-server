import { describe, it, expect, beforeEach } from 'vitest';
import { createMock } from '@golevelup/ts-vitest';
import { type ConfigService } from '@nestjs/config';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { MtaHooksAuthGuard } from './mta-hooks-auth.guard.js';

const username = 'stalwart';
const secret = 'secret';

describe('MtaHooksAuthGuard', () => {
  let guard: MtaHooksAuthGuard;

  const contextWithAuth = (header?: string): ExecutionContext =>
    createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: header ? { authorization: header } : {},
        }),
      }),
    });

  const basic = (username: string, secret: string): string =>
    `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`;

  beforeEach(() => {
    const configService = createMock<ConfigService>();
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'mtaHooks.username') return username;
      if (key === 'mtaHooks.secret') return secret;
      throw new Error(`unknown key: ${key}`);
    });
    guard = new MtaHooksAuthGuard(configService);
  });

  it('when credentials match, then allows the request', () => {
    const context = contextWithAuth(basic(username, secret));

    expect(guard.canActivate(context)).toBe(true);
  });

  it('when the secret is wrong, then throws Unauthorized', () => {
    const context = contextWithAuth(basic(username, 'wrong'));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('when the username is wrong, then throws Unauthorized', () => {
    const context = contextWithAuth(basic('wrong', secret));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('when the Authorization header is missing, then throws Unauthorized', () => {
    const context = contextWithAuth(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('when the scheme is not Basic, then throws Unauthorized', () => {
    const context = contextWithAuth('Bearer some-token');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('when the decoded credentials lack a colon separator, then throws Unauthorized', () => {
    const context = contextWithAuth(
      `Basic ${Buffer.from('nocolon').toString('base64')}`,
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
