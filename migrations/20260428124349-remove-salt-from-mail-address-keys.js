'use strict';

const TABLE_NAME = 'mail_address_keys';
const COLUMN_NAME = 'salt';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
  },
};
