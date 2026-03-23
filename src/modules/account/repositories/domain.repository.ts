import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { MailDomain } from '../domain/mail-domain.domain.js';
import { MailDomainModel } from '../models/mail-domain.model.js';

@Injectable()
export class DomainRepository {
  constructor(
    @InjectModel(MailDomainModel)
    private readonly domainModel: typeof MailDomainModel,
  ) {}

  async findByDomain(domain: string): Promise<MailDomain | null> {
    const model = await this.domainModel.findOne({ where: { domain } });
    return model ? this.toDomain(model) : null;
  }

  private toDomain(model: MailDomainModel): MailDomain {
    return MailDomain.build({
      id: model.id,
      domain: model.domain,
      status: model.status,
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
    });
  }
}
