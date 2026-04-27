import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MailAccountGuard } from './provisioning.guard.js';
import { AccountService } from '../account/account.service.js';
import { MailAccount } from '../account/domain/mail-account.domain.js';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { SKIP_MAIL_ACCOUNT_CHECK_KEY } from './skip-mail-account-check.decorator.js';
import {
  type DeepPartialMocked,
  newUserPayload,
} from '../../../test/fixtures.js';

describe('MailAccountGuard', () => {
  let guard: MailAccountGuard;
  let accountService: DeepPartialMocked<AccountService>;
  let reflector: DeepMocked<Reflector>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailAccountGuard],
    })
      .useMocker(() => createMock<object>())
      .compile();

    guard = module.get(MailAccountGuard);
    accountService = module.get(AccountService);
    reflector = module.get(Reflector);
  });

  function mockContext(user = newUserPayload()): ExecutionContext {
    const request = { user };
    return {
      getHandler: () => () => {},
      getClass: () => Object,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('when user has a provisioned account, then allows the request', async () => {
    const user = newUserPayload();
    accountService.findAccount.mockResolvedValue({
      userId: user.uuid,
      isFrozen: false,
    });

    const result = await guard.canActivate(mockContext(user));

    expect(result).toBe(true);
    expect(accountService.findAccount).toHaveBeenCalledWith(user.uuid);
  });

  it('when user has no mail account, then throws ForbiddenException with MAIL_NOT_SETUP code', async () => {
    const user = newUserPayload();
    accountService.findAccount.mockResolvedValue(null);

    try {
      await guard.canActivate(mockContext(user));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error).toMatchObject({ response: { code: 'MAIL_NOT_SETUP' } });
    }
  });

  it('when user has mail account frozen, then throws ForbiddenException with MAIL_FROZEN code', async () => {
    const user = newUserPayload();
    accountService.findAccount.mockResolvedValue({
      userId: user.uuid,
      isFrozen: true,
    });

    try {
      await guard.canActivate(mockContext(user));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error).toMatchObject({ response: { code: 'MAIL_FROZEN' } });
    }
  });

  it('when handler is marked with SkipMailAccountCheck, then allows without checking the account', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === SKIP_MAIL_ACCOUNT_CHECK_KEY ? true : undefined,
    );

    const result = await guard.canActivate(mockContext());

    expect(result).toBe(true);
    expect(accountService.findAccount).not.toHaveBeenCalled();
  });

  it('when handler is marked as public, then allows without checking the account', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );

    const result = await guard.canActivate(mockContext());

    expect(result).toBe(true);
    expect(accountService.findAccount).not.toHaveBeenCalled();
  });
});
