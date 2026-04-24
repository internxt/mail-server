'use strict';

const TABLE_NAME = 'mail_address_keys';

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
      mail_address_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'mail_addresses', key: 'id' },
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
      salt: {
        type: Sequelize.STRING(64),
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
