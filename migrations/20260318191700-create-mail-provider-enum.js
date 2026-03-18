'use strict';

const ENUM_NAME = 'mail_provider';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `CREATE TYPE ${ENUM_NAME} AS ENUM ('stalwart')`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TYPE ${ENUM_NAME}`);
  },
};
