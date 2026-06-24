export interface MailBucketEntryAttributes {
  id: string;
  mailAddressId: string;
  entryKey: string;
  bridgeEntryId: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export class MailBucketEntry {
  readonly id!: string;
  readonly mailAddressId!: string;
  readonly entryKey!: string;
  readonly bridgeEntryId!: string;
  readonly size!: number;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  private constructor(attributes: MailBucketEntryAttributes) {
    Object.assign(this, attributes);
  }

  static build(attributes: MailBucketEntryAttributes): MailBucketEntry {
    return new MailBucketEntry(attributes);
  }
}
