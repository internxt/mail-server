import type { AccountInfo, CreateAccountParams } from './account.types.js';

export abstract class AccountProvider {
  abstract createAccount(params: CreateAccountParams): Promise<void>;
  abstract deleteAccount(name: string): Promise<void>;
  abstract getAccount(name: string): Promise<AccountInfo | null>;
  abstract addAddress(name: string, address: string): Promise<void>;
  abstract removeAddress(name: string, address: string): Promise<void>;
  abstract setPrimaryAddress(
    currentName: string,
    newPrimaryAddress: string,
  ): Promise<void>;
  abstract updateQuota(name: string, bytes: number): Promise<void>;
  abstract createDomain(domain: string): Promise<void>;
  abstract deleteDomain(domain: string): Promise<void>;
}
