import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { MailDomain, MailDomainStatus } from '../domain/mail-domain.domain.js';
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

  async findAllActive(): Promise<MailDomain[]> {
    const models = await this.domainModel.findAll({
      where: { status: 'active' },
    });
    return models.map((m) => this.toDomain(m));
  }

  private toDomain(model: MailDomainModel): MailDomain {
    return MailDomain.build({
      id: model.id,
      domain: model.domain,
      status: model.status as MailDomainStatus,
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
    });
  }
}
