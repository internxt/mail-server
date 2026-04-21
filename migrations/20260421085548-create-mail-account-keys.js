'use strict';

const TABLE_NAME = 'mail_account_keys';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(TABLE_NAME, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      mail_account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'mail_accounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      public_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      encryption_private_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      recovery_private_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE_NAME);
  },
};
