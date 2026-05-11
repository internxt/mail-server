'use strict';

const TABLE_NAME = 'mail_accounts';
const PURGE_INDEX = 'mail_accounts_suspended_at_purge_idx';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE_NAME, 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    });

    await queryInterface.addColumn(TABLE_NAME, 'suspended_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.sequelize.query(
      `CREATE INDEX ${PURGE_INDEX}
       ON ${TABLE_NAME} (suspended_at)
       WHERE status = 'suspended'`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${PURGE_INDEX}`);
    await queryInterface.removeColumn(TABLE_NAME, 'suspended_at');
    await queryInterface.removeColumn(TABLE_NAME, 'status');
  },
};
