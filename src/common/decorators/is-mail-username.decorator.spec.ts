import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import {
  IsMailUsername,
  isValidMailUsername,
} from './is-mail-username.decorator.js';

class TestDto {
  @IsMailUsername()
  username!: string;
}

describe('isValidMailUsername', () => {
  it('when username is between 3 and 30 characters, then it is valid', () => {
    expect(isValidMailUsername('abc')).toBe(true);
    expect(isValidMailUsername('a'.repeat(30))).toBe(true);
  });

  it('when username has fewer than 3 characters, then it is invalid', () => {
    expect(isValidMailUsername('ab')).toBe(false);
  });

  it('when username has more than 30 characters, then it is invalid', () => {
    expect(isValidMailUsername('a'.repeat(31))).toBe(false);
  });

  it('when username only contains lowercase letters, numbers, periods, hyphens and underscores, then it is valid', () => {
    expect(isValidMailUsername('jane.doe-99_x')).toBe(true);
  });

  it('when username contains an uppercase letter, then it is invalid', () => {
    expect(isValidMailUsername('Jane')).toBe(false);
  });

  it('when username contains an unsupported symbol, then it is invalid', () => {
    expect(isValidMailUsername('jane@doe')).toBe(false);
  });

  it('when username has two consecutive special characters, then it is invalid', () => {
    expect(isValidMailUsername('jane..doe')).toBe(false);
    expect(isValidMailUsername('jane__doe')).toBe(false);
    expect(isValidMailUsername('jane.-doe')).toBe(false);
  });

  it('when username starts or ends with a special character, then it is invalid', () => {
    expect(isValidMailUsername('.jane')).toBe(false);
    expect(isValidMailUsername('jane-')).toBe(false);
    expect(isValidMailUsername('_jane')).toBe(false);
  });

  it('when username is a reserved name, then it is invalid', () => {
    expect(isValidMailUsername('admin')).toBe(false);
    expect(isValidMailUsername('postmaster')).toBe(false);
  });

  it('when username is not a string, then it is invalid', () => {
    expect(isValidMailUsername(undefined)).toBe(false);
    expect(isValidMailUsername(123)).toBe(false);
  });
});

describe('IsMailUsername', () => {
  it('when the DTO has a valid username, then validation passes', async () => {
    const dto = new TestDto();
    dto.username = 'jane.doe';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('when the DTO has an invalid username, then validation fails with isMailUsername', async () => {
    const dto = new TestDto();
    dto.username = 'admin';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('isMailUsername');
  });
});
