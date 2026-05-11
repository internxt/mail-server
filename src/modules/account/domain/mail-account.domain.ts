import {
  MailAddress,
  type MailAddressAttributes,
} from './mail-address.domain.js';

export enum MailAccountState {
  Active = 'active',
  Suspended = 'suspended',
}

export interface MailAccountAttributes {
  id: string;
  userId: string;
  state: MailAccountState;
  suspendedAt: Date | null;
  addresses: MailAddressAttributes[];
  createdAt: Date;
  updatedAt: Date;
}

export class MailAccount {
  readonly id!: string;
  readonly userId!: string;
  readonly state!: MailAccountState;
  readonly suspendedAt!: Date | null;
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

  get defaultAddress(): MailAddress | undefined {
    return this.addresses.find((a) => a.isDefault);
  }

  get isSuspended(): boolean {
    return this.state === MailAccountState.Suspended;
  }
}
