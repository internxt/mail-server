import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountService } from '../account/account.service.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { SKIP_MAIL_ACCOUNT_CHECK_KEY } from './skip-mail-account-check.decorator.js';

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
      .getRequest<Request & { user: UserPayload }>();
    const user = request.user;

    const account = await this.accountService.findAccount(user.uuid);

    if (!account) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MAIL_NOT_SETUP',
        message: 'Mail account has not been set up',
      });
    }

    return true;
  }
}
