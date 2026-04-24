import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { MailAddress as MailAddressDomain } from '../domain/mail-address.domain.js';

export interface RequestWithMailAddress extends Request {
  mailAddress?: MailAddressDomain;
}

export function mailAddressFactory(
  field: keyof MailAddressDomain | undefined,
  ctx: ExecutionContext,
): MailAddressDomain | MailAddressDomain[keyof MailAddressDomain] {
  const request = ctx.switchToHttp().getRequest<RequestWithMailAddress>();
  const mailAddress = request.mailAddress;
  if (!mailAddress) {
    throw new InternalServerErrorException(
      'MailAddress is not attached to the request',
    );
  }
  return field ? mailAddress[field] : mailAddress;
}

export const MailAddress = createParamDecorator(mailAddressFactory);
