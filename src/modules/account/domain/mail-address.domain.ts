export interface MailAddressAttributes {
  id: string;
  mailAccountId: string;
  address: string;
  domainId: string;
  isDefault: boolean;
  providerExternalId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MailAddress {
  readonly id!: string;
  readonly mailAccountId!: string;
  readonly address!: string;
  readonly domainId!: string;
  readonly isDefault!: boolean;
  readonly providerExternalId!: string;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  private constructor(attributes: MailAddressAttributes) {
    Object.assign(this, attributes);
  }

  static build(attributes: MailAddressAttributes): MailAddress {
    return new MailAddress(attributes);
  }
}
