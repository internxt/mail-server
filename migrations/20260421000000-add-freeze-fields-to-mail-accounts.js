'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('mail_accounts', 'enabled_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()'),
    });

    await queryInterface.addColumn('mail_accounts', 'disabled_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('mail_accounts', 'enabled_at');
    await queryInterface.removeColumn('mail_accounts', 'disabled_at');
  },
};
