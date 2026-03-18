'use strict';

const TABLE_NAME = 'mail_addresses';

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
        references: {
          model: 'mail_accounts',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      address: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      domain_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'mail_domains',
          key: 'id',
        },
        onDelete: 'RESTRICT',
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex(TABLE_NAME, ['mail_account_id']);
    await queryInterface.addIndex(TABLE_NAME, ['domain_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE_NAME);
  },
};
