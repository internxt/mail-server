import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { MailNotSetupException } from './mail-not-setup.exception.js';
import { SKIP_MAIL_ACCOUNT_CHECK_KEY } from './skip-mail-account-check.decorator.js';
import type { RequestWithMailAddress } from '../account/decorators/mail-address.decorator.js';

@Injectable()
export class MailAccountGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accountService: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    const skipAccountCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_MAIL_ACCOUNT_CHECK_KEY,
      targets,
    );

    if (isPublic || skipAccountCheck) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<RequestWithMailAddress & { user: UserPayload }>();
    const user = request.user;

    const account = await this.accountService.findAccount(user.uuid);

    if (!account) {
      throw new MailNotSetupException();
    }

    const defaultAddress = account.defaultAddress;
    if (!defaultAddress) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MAIL_DEFAULT_ADDRESS_MISSING',
        message: 'Mail account has no default address',
      });
    }

    request.mailAddress = defaultAddress;

    return true;
  }
}
