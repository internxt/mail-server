import { ForbiddenException } from '@nestjs/common';

export const MAIL_NOT_SETUP_CODE = 'MAIL_NOT_SETUP';

export class MailNotSetupException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: MAIL_NOT_SETUP_CODE,
      message: 'Mail account has not been set up',
    });
  }
}
