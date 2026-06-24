'use strict';

const TABLE_NAME = 'mail_bucket_entries';

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
        references: { model: 'mail_addresses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      entry_key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      bridge_entry_id: {
        type: Sequelize.STRING(24),
        allowNull: false,
      },
      size: {
        type: Sequelize.BIGINT,
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

    await queryInterface.addIndex(TABLE_NAME, ['mail_address_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE_NAME);
  },
};
