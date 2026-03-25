import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserPayload } from '../jwt-payload.dto.js';

interface AuthenticatedRequest extends Request {
  user: UserPayload;
}

export const User = createParamDecorator(
  (field: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    return field ? user[field] : user;
  },
);
