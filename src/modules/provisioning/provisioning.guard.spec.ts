import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MailAccountGuard } from './provisioning.guard.js';
import { AccountService } from '../account/account.service.js';
import { MailAccount } from '../account/domain/mail-account.domain.js';
import {
  newMailAccountAttributes,
  newUserPayload,
} from '../../../test/fixtures.js';

describe('MailAccountGuard', () => {
  let guard: MailAccountGuard;
  let accountService: DeepMocked<AccountService>;

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
    const account = MailAccount.build(
      newMailAccountAttributes({ userId: user.uuid }),
    );
    accountService.findAccount.mockResolvedValue(account);

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
      expect((error as ForbiddenException).getResponse()).toEqual(
        expect.objectContaining({ code: 'MAIL_NOT_SETUP' }),
      );
    }
  });
});
