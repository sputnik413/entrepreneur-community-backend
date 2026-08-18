import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordHashToUsers1787035759000 implements MigrationInterface {
  name = 'AddPasswordHashToUsers1787035759000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD "password_hash" character varying(60) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "password_hash"');
  }
}
