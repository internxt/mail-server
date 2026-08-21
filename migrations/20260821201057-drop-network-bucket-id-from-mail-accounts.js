'use strict';

const TABLE_NAME = 'mail_accounts';
const COLUMN_NAME = 'network_bucket_id';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
      type: Sequelize.STRING(24),
      allowNull: true,
      defaultValue: null,
    });
  },
};
