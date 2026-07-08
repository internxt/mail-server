'use strict';

const TABLE_NAME = 'mail_accounts';
const INDEX_NAME = 'mail_accounts_user_id_active_unique';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS mail_accounts_drive_user_uuid_key`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS mail_accounts_user_id_key`,
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ${INDEX_NAME}
       ON ${TABLE_NAME} (user_id)
       WHERE deleted_at IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
    await queryInterface.addConstraint(TABLE_NAME, {
      fields: ['user_id'],
      type: 'unique',
      name: 'mail_accounts_user_id_key',
    });
  },
};
