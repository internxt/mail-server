'use strict';

const INDEX_NAME = 'mail_provider_accounts_unique_provider_internal_id';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'mail_provider_accounts',
      'provider_internal_id',
      {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
    );

    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ${INDEX_NAME}
       ON mail_provider_accounts (provider, provider_internal_id)
       WHERE deleted_at IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
    await queryInterface.removeColumn(
      'mail_provider_accounts',
      'provider_internal_id',
    );
  },
};
