export interface MailAddressKeysAttributes {
  id: string;
  mailAddressId: string;
  publicKey: string;
  encryptionPrivateKey: string;
  recoveryPrivateKey: string;
  salt: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MailAddressKeys {
  readonly id!: string;
  readonly mailAddressId!: string;
  readonly publicKey!: string;
  readonly encryptionPrivateKey!: string;
  readonly recoveryPrivateKey!: string;
  readonly salt!: string;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  private constructor(attributes: MailAddressKeysAttributes) {
    Object.assign(this, attributes);
  }

  static build(attributes: MailAddressKeysAttributes): MailAddressKeys {
    return new MailAddressKeys(attributes);
  }
}
