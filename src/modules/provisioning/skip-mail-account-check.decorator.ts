import { SetMetadata } from '@nestjs/common';

export const SKIP_MAIL_ACCOUNT_CHECK_KEY = 'skipMailAccountCheck';
export const SkipMailAccountCheck = () =>
  SetMetadata(SKIP_MAIL_ACCOUNT_CHECK_KEY, true);
