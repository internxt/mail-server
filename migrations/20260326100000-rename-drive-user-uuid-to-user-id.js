'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn(
      'mail_accounts',
      'drive_user_uuid',
      'user_id',
    );
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      'mail_accounts',
      'user_id',
      'drive_user_uuid',
    );
  },
};
