export interface CreateAccountParams {
  accountId: string;
  primaryAddress: string;
  displayName: string;
  password: string;
  quota?: number;
}

export interface CreateAccountResult {
  provider: string;
  externalId: string;
  internalId: string;
}

export interface AccountInfo {
  name: string;
  displayName: string;
  emails: string[];
  quota: number;
}
