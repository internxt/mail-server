import type { AccountInfo, CreateAccountParams } from './account.types.js';

export abstract class AccountProvider {
  abstract createAccount(params: CreateAccountParams): Promise<void>;
  abstract deleteAccount(name: string): Promise<void>;
  abstract getAccount(name: string): Promise<AccountInfo | null>;
  abstract suspendAccount(name: string): Promise<void>;
  abstract reactivateAccount(name: string): Promise<void>;
}
