import { Migration } from '@mikro-orm/migrations'

export class Migration20260330000001 extends Migration {
  override async up(): Promise<void> {
    // Add start_date (required, default to closed_at for existing rows)
    this.addSql(`ALTER TABLE "partner_license_deals" ADD COLUMN "start_date" timestamptz`)
    this.addSql(`UPDATE "partner_license_deals" SET "start_date" = "closed_at" WHERE "start_date" IS NULL`)
    this.addSql(`ALTER TABLE "partner_license_deals" ALTER COLUMN "start_date" SET NOT NULL`)

    // Add end_date (nullable — null means perpetual)
    this.addSql(`ALTER TABLE "partner_license_deals" ADD COLUMN "end_date" timestamptz NULL`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "partner_license_deals" DROP COLUMN "end_date"`)
    this.addSql(`ALTER TABLE "partner_license_deals" DROP COLUMN "start_date"`)
  }
}
