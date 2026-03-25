import { Migration } from '@mikro-orm/migrations';

export class Migration20260325092955 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "rfp_settings" ("id" uuid not null default gen_random_uuid(), "campaign_template" text not null, "award_template" text not null, "rejection_template" text not null, "tenant_id" uuid not null, "updated_at" timestamptz not null, constraint "rfp_settings_pkey" primary key ("id"));`);
    this.addSql(`alter table "rfp_settings" add constraint "rfp_settings_tenant_idx" unique ("tenant_id");`);
  }

}
