'use strict';

const TABLE_NAME = 'mail_addresses';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE_NAME, 'network_bucket_id', {
      type: Sequelize.STRING(24),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(TABLE_NAME, 'network_bucket_id');
  },
};
