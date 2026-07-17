import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const MAIL_USERNAME_MIN_LENGTH = 3;
export const MAIL_USERNAME_MAX_LENGTH = 30;

const ALLOWED_CHARS_REGEX = /^[a-z0-9._-]+$/;
const EDGE_SPECIAL_CHARS_REGEX = /^[._-]|[._-]$/;
const CONSECUTIVE_SPECIAL_CHARS_REGEX = /[._-]{2,}/;

export const RESERVED_MAIL_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'postmaster',
  'noreply',
  'no-reply',
  'webmaster',
  'hostmaster',
  'abuse',
  'security',
  'info',
  'help',
  'contact',
  'billing',
  'sales',
  'mailer-daemon',
  'daemon',
  'ftp',
  'www',
  'system',
  'test',
]);

export function isValidMailUsername(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MAIL_USERNAME_MIN_LENGTH &&
    value.length <= MAIL_USERNAME_MAX_LENGTH &&
    ALLOWED_CHARS_REGEX.test(value) &&
    !CONSECUTIVE_SPECIAL_CHARS_REGEX.test(value) &&
    !EDGE_SPECIAL_CHARS_REGEX.test(value) &&
    !RESERVED_MAIL_USERNAMES.has(value)
  );
}

@ValidatorConstraint({ name: 'isMailUsername', async: false })
class IsMailUsernameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidMailUsername(value);
  }

  defaultMessage(): string {
    return `address must be ${MAIL_USERNAME_MIN_LENGTH}-${MAIL_USERNAME_MAX_LENGTH} characters, contain only lowercase letters, numbers, ".", "-" or "_", not start/end with a special character or repeat one, and not be a reserved name`;
  }
}

/**
 * Validates the local part (before the @) of a mail address, mirroring the
 * rules enforced client-side in mail-web (identity-setup/emailAddressRules).
 */
export function IsMailUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsMailUsernameConstraint,
    });
  };
}
