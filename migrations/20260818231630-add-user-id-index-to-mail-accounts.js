'use strict';

const TABLE_NAME = 'mail_accounts';
const INDEX_NAME = 'mail_accounts_user_id_idx';

/**
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex(TABLE_NAME, ['user_id'], {
      name: INDEX_NAME,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(TABLE_NAME, INDEX_NAME);
  },
};
