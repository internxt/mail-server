'use strict';

const { Op } = require('sequelize');

const DOMAIN_NAME = 'inxt.eu';

const users = [
  {
    accountId: 'a1b2c3d4-0000-0000-0000-000000000002',
    userId: '87204d6b-c4a7-4f38-bd99-f7f47964a643',
    addressId: 'a1b2c3d4-0000-0000-0000-000000000003',
    providerAccountId: 'a1b2c3d4-0000-0000-0000-000000000004',
    address: 'john@inxt.eu',
  },
  {
    accountId: 'a1b2c3d4-0000-0000-0000-000000000012',
    userId: 'a1b2c3d4-0000-0000-0000-0000000000a1',
    addressId: 'a1b2c3d4-0000-0000-0000-000000000013',
    providerAccountId: 'a1b2c3d4-0000-0000-0000-000000000014',
    address: 'alice@inxt.eu',
  },
  {
    accountId: 'a1b2c3d4-0000-0000-0000-000000000022',
    userId: 'a1b2c3d4-0000-0000-0000-0000000000b1',
    addressId: 'a1b2c3d4-0000-0000-0000-000000000023',
    providerAccountId: 'a1b2c3d4-0000-0000-0000-000000000024',
    address: 'bob@inxt.eu',
  },
];

module.exports = {
  async up(queryInterface) {
    const [domain] = await queryInterface.sequelize.query(
      'SELECT id FROM mail_domains WHERE domain = :name',
      { replacements: { name: DOMAIN_NAME }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (!domain) {
      throw new Error(`Domain ${DOMAIN_NAME} not found — ensure add-mail-domains seeder runs first`);
    }

    const now = new Date();

    for (const u of users) {
      const [existingAccount] = await queryInterface.sequelize.query(
        'SELECT id FROM mail_accounts WHERE user_id = :uuid',
        { replacements: { uuid: u.userId }, type: queryInterface.sequelize.QueryTypes.SELECT },
      );
      if (!existingAccount) {
        await queryInterface.bulkInsert('mail_accounts', [
          { id: u.accountId, user_id: u.userId, created_at: now, updated_at: now },
        ]);
      }

      const [existingAddress] = await queryInterface.sequelize.query(
        'SELECT id FROM mail_addresses WHERE address = :address',
        { replacements: { address: u.address }, type: queryInterface.sequelize.QueryTypes.SELECT },
      );
      if (!existingAddress) {
        await queryInterface.bulkInsert('mail_addresses', [
          {
            id: u.addressId,
            mail_account_id: u.accountId,
            address: u.address,
            domain_id: domain.id,
            is_default: true,
            created_at: now,
            updated_at: now,
          },
        ]);
      }

      const [existingProviderAccount] = await queryInterface.sequelize.query(
        'SELECT id FROM mail_provider_accounts WHERE mail_address_id = :id',
        { replacements: { id: u.addressId }, type: queryInterface.sequelize.QueryTypes.SELECT },
      );
      if (!existingProviderAccount) {
        await queryInterface.bulkInsert('mail_provider_accounts', [
          {
            id: u.providerAccountId,
            mail_address_id: u.addressId,
            provider: 'stalwart',
            external_id: u.address,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('mail_provider_accounts', {
      id: { [Op.in]: users.map((u) => u.providerAccountId) },
    });
    await queryInterface.bulkDelete('mail_addresses', {
      id: { [Op.in]: users.map((u) => u.addressId) },
    });
    await queryInterface.bulkDelete('mail_accounts', {
      id: { [Op.in]: users.map((u) => u.accountId) },
    });
  },
};

module.exports.fixtures = { users };
