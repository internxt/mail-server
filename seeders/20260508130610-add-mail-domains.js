'use strict';

const DOMAINS = ['inxt.me', 'inxt.eu', 'encrypt.eu'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      'mail_domains',
      DOMAINS.map((domain) => ({
        id: require('crypto').randomUUID(),
        domain,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('mail_domains', { domain: DOMAINS });
  },
};
