export interface MailAccountKeysAttributes {
  id: string;
  mailAccountId: string;
  publicKey: string;
  encryptionPrivateKey: string;
  recoveryPrivateKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MailAccountKeys {
  readonly id!: string;
  readonly mailAccountId!: string;
  readonly publicKey!: string;
  readonly encryptionPrivateKey!: string;
  readonly recoveryPrivateKey!: string;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  private constructor(attributes: MailAccountKeysAttributes) {
    Object.assign(this, attributes);
  }

  static build(attributes: MailAccountKeysAttributes): MailAccountKeys {
    return new MailAccountKeys(attributes);
  }
}
