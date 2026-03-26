'use strict';

const { v4 } = require('uuid');
const { Op } = require('sequelize');

const domain = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  domain: 'internxt.eu',
  status: 'active',
  created_at: new Date(),
  updated_at: new Date(),
};

const account = {
  id: 'a1b2c3d4-0000-0000-0000-000000000002',
  // Matches the uuid of the test user in drive-server-wip seeders
  user_id: '87204d6b-c4a7-4f38-bd99-f7f47964a643',
  created_at: new Date(),
  updated_at: new Date(),
};

const address = {
  id: 'a1b2c3d4-0000-0000-0000-000000000003',
  mail_account_id: account.id,
  address: 'john@internxt.eu',
  domain_id: domain.id,
  is_default: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const providerAccount = {
  id: 'a1b2c3d4-0000-0000-0000-000000000004',
  mail_address_id: address.id,
  provider: 'stalwart',
  external_id: address.address,
  created_at: new Date(),
  updated_at: new Date(),
};

module.exports = {
  async up(queryInterface) {
    const [existingDomains] = await queryInterface.sequelize.query(
      'SELECT id FROM mail_domains WHERE id = :id',
      { replacements: { id: domain.id }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (!existingDomains) {
      await queryInterface.bulkInsert('mail_domains', [domain]);
    }

    const [existingAccount] = await queryInterface.sequelize.query(
      'SELECT id FROM mail_accounts WHERE user_id = :uuid',
      { replacements: { uuid: account.user_id }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (!existingAccount) {
      await queryInterface.bulkInsert('mail_accounts', [account]);
    }

    const [existingAddress] = await queryInterface.sequelize.query(
      'SELECT id FROM mail_addresses WHERE address = :address',
      { replacements: { address: address.address }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (!existingAddress) {
      await queryInterface.bulkInsert('mail_addresses', [address]);
    }

    const [existingProviderAccount] = await queryInterface.sequelize.query(
      'SELECT id FROM mail_provider_accounts WHERE mail_address_id = :id',
      { replacements: { id: address.id }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (!existingProviderAccount) {
      await queryInterface.bulkInsert('mail_provider_accounts', [providerAccount]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('mail_provider_accounts', {
      id: { [Op.in]: [providerAccount.id] },
    });
    await queryInterface.bulkDelete('mail_addresses', {
      id: { [Op.in]: [address.id] },
    });
    await queryInterface.bulkDelete('mail_accounts', {
      id: { [Op.in]: [account.id] },
    });
    await queryInterface.bulkDelete('mail_domains', {
      id: { [Op.in]: [domain.id] },
    });
  },
};

module.exports.fixtures = { domain, account, address, providerAccount };
