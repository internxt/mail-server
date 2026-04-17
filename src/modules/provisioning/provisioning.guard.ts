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

@Injectable()
export class MailAccountGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accountService: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
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
