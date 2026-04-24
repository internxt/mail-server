import { describe, it, expect } from 'vitest';
import {
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { mailAddressFactory } from './mail-address.decorator.js';
import { MailAddress } from '../domain/mail-address.domain.js';
import { newMailAddressAttributes } from '../../../../test/fixtures.js';

function mockContext(mailAddress?: MailAddress): ExecutionContext {
  const request = { mailAddress };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('mailAddressFactory', () => {
  it('when called without a field, then returns the full MailAddress', () => {
    const mailAddress = MailAddress.build(newMailAddressAttributes());

    const result = mailAddressFactory(undefined, mockContext(mailAddress));

    expect(result).toBe(mailAddress);
  });

  it('when called with a field, then returns that field', () => {
    const mailAddress = MailAddress.build(newMailAddressAttributes());

    const result = mailAddressFactory('address', mockContext(mailAddress));

    expect(result).toBe(mailAddress.address);
  });

  it('when the request has no mailAddress, then throws InternalServerErrorException', () => {
    expect(() => mailAddressFactory(undefined, mockContext())).toThrow(
      InternalServerErrorException,
    );
  });
});
