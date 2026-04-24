import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MailAccountGuard } from './provisioning.guard.js';
import { AccountService } from '../account/account.service.js';
import { MailAccount } from '../account/domain/mail-account.domain.js';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { SKIP_MAIL_ACCOUNT_CHECK_KEY } from './skip-mail-account-check.decorator.js';
import {
  newMailAccountAttributes,
  newUserPayload,
} from '../../../test/fixtures.js';

describe('MailAccountGuard', () => {
  let guard: MailAccountGuard;
  let accountService: DeepMocked<AccountService>;
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

  function mockContext(user = newUserPayload()): {
    ctx: ExecutionContext;
    request: { user: ReturnType<typeof newUserPayload>; mailAddress?: unknown };
  } {
    const request: {
      user: ReturnType<typeof newUserPayload>;
      mailAddress?: unknown;
    } = { user };
    const ctx = {
      getHandler: () => () => {},
      getClass: () => Object,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  it('when user has a provisioned account, then allows the request and attaches the default address', async () => {
    const user = newUserPayload();
    const account = MailAccount.build(
      newMailAccountAttributes({ userId: user.uuid }),
    );
    accountService.findAccount.mockResolvedValue(account);

    const { ctx, request } = mockContext(user);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(accountService.findAccount).toHaveBeenCalledWith(user.uuid);
    expect(request.mailAddress).toBe(account.defaultAddress);
  });

  it('when user has no mail account, then throws ForbiddenException with MAIL_NOT_SETUP code', async () => {
    const user = newUserPayload();
    accountService.findAccount.mockResolvedValue(null);

    try {
      await guard.canActivate(mockContext(user).ctx);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual(
        expect.objectContaining({ code: 'MAIL_NOT_SETUP' }),
      );
    }
  });

  it('when account exists but has no default address, then throws MAIL_DEFAULT_ADDRESS_MISSING', async () => {
    const user = newUserPayload();
    const account = MailAccount.build(
      newMailAccountAttributes({
        userId: user.uuid,
        addresses: [],
      }),
    );
    accountService.findAccount.mockResolvedValue(account);

    try {
      await guard.canActivate(mockContext(user).ctx);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual(
        expect.objectContaining({ code: 'MAIL_DEFAULT_ADDRESS_MISSING' }),
      );
    }
  });

  it('when handler is marked with SkipMailAccountCheck, then allows without checking the account or attaching an address', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === SKIP_MAIL_ACCOUNT_CHECK_KEY ? true : undefined,
    );

    const { ctx, request } = mockContext();
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(accountService.findAccount).not.toHaveBeenCalled();
    expect(request.mailAddress).toBeUndefined();
  });

  it('when handler is marked as public, then allows without checking the account', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );

    const result = await guard.canActivate(mockContext().ctx);

    expect(result).toBe(true);
    expect(accountService.findAccount).not.toHaveBeenCalled();
  });
});
