'use strict';

const INDEX_NAME = 'mail_addresses_unique_default_per_account';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ${INDEX_NAME}
       ON mail_addresses (mail_account_id)
       WHERE is_default IS TRUE AND deleted_at IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  },
};
