import {
  MailAddress,
  type MailAddressAttributes,
} from './mail-address.domain.js';

export enum MailAccountState {
  Active = 'active',
  Suspended = 'suspended',
  Deleting = 'deleting',
}

export interface MailAccountAttributes {
  id: string;
  userId: string;
  status: MailAccountState;
  suspendedAt: Date | null;
  addresses: MailAddressAttributes[];
  createdAt: Date;
  updatedAt: Date;
}

export class MailAccount {
  readonly id!: string;
  readonly userId!: string;
  readonly status!: MailAccountState;
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
    return this.status === MailAccountState.Suspended;
  }

  get isBeingDeleted(): boolean {
    return this.status === MailAccountState.Deleting;
  }
}
