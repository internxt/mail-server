import {
  MailAddress,
  type MailAddressAttributes,
} from './mail-address.domain.js';

export interface MailAccountAttributes {
  id: string;
  userId: string;
  enabledAt: Date;
  disabledAt: Date | null;
  addresses: MailAddressAttributes[];
  createdAt: Date;
  updatedAt: Date;
}

export class MailAccount {
  readonly id!: string;
  readonly userId!: string;
  readonly enabledAt!: Date;
  readonly disabledAt!: Date | null;
  readonly addresses!: MailAddress[];
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  private constructor(attributes: MailAccountAttributes) {
    Object.assign(this, attributes);
    this.addresses = attributes.addresses.map((a) => MailAddress.build(a));
  }

  static build(attributes: MailAccountAttributes): MailAccount {
    return new MailAccount(attributes);
  }

  get isFrozen(): boolean {
    return this.disabledAt !== null;
  }

  get defaultAddress(): MailAddress | undefined {
    return this.addresses.find((a) => a.isDefault);
  }
}
