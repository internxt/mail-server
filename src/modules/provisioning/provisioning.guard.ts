import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountService } from '../account/account.service.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';

@Injectable()
export class MailAccountGuard implements CanActivate {
  constructor(private readonly accountService: AccountService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    if (account.isFrozen) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MAIL_FROZEN',
        message: 'Mail account is frozen due to plan downgrade',
      });
    }

    return true;
  }
}
