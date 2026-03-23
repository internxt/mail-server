export interface MailDomainAttributes {
  id: string;
  domain: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MailDomain {
  readonly id!: string;
  readonly domain!: string;
  readonly status!: string;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;

  private constructor(attributes: MailDomainAttributes) {
    Object.assign(this, attributes);
  }

  static build(attributes: MailDomainAttributes): MailDomain {
    return new MailDomain(attributes);
  }
}
