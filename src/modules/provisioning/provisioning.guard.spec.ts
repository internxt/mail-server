import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MailAccountGuard } from './provisioning.guard.js';
import { AccountService } from '../account/account.service.js';
import {
  type DeepPartialMocked,
  newUserPayload,
} from '../../../test/fixtures.js';

describe('MailAccountGuard', () => {
  let guard: MailAccountGuard;
  let accountService: DeepPartialMocked<AccountService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailAccountGuard],
    })
      .useMocker(() => createMock<object>())
      .compile();

    guard = module.get(MailAccountGuard);
    accountService = module.get(AccountService);
  });

  function mockContext(user = newUserPayload()): ExecutionContext {
    const request = { user };
    return {
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
});
