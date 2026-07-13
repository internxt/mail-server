'use strict';

const TABLE_NAME = 'mail_addresses';
const INDEX_NAME = 'mail_addresses_address_active_unique';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS mail_addresses_address_key`,
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ${INDEX_NAME}
       ON ${TABLE_NAME} (address)
       WHERE deleted_at IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
    await queryInterface.addConstraint(TABLE_NAME, {
      fields: ['address'],
      type: 'unique',
      name: 'mail_addresses_address_key',
    });
  },
};
