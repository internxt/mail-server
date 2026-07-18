'use strict';

const TABLE_NAME = 'mail_provider_accounts';
const ADDRESS_INDEX = 'mail_provider_accounts_mail_address_id_active_unique';
const PROVIDER_INDEX = 'mail_provider_accounts_provider_external_id_active_unique';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS mail_provider_accounts_mail_address_id_key`,
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ${ADDRESS_INDEX}
       ON ${TABLE_NAME} (mail_address_id)
       WHERE deleted_at IS NULL`,
    );

    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS mail_provider_accounts_provider_external_id`,
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ${PROVIDER_INDEX}
       ON ${TABLE_NAME} (provider, external_id)
       WHERE deleted_at IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${ADDRESS_INDEX}`);
    await queryInterface.addConstraint(TABLE_NAME, {
      fields: ['mail_address_id'],
      type: 'unique',
      name: 'mail_provider_accounts_mail_address_id_key',
    });

    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${PROVIDER_INDEX}`);
    await queryInterface.addIndex(TABLE_NAME, ['provider', 'external_id'], {
      unique: true,
    });
  },
};
