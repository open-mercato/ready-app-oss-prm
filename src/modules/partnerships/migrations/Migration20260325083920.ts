import { Migration } from '@mikro-orm/migrations';

export class Migration20260325083920 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "partner_rfp_campaigns" ("id" uuid not null default gen_random_uuid(), "title" text not null, "description" text not null, "deadline" timestamptz not null, "audience" text not null default 'all', "selected_agency_ids" jsonb null, "status" text not null default 'draft', "winner_organization_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_by" uuid not null, "created_at" timestamptz not null, constraint "partner_rfp_campaigns_pkey" primary key ("id"));`);
    this.addSql(`create index "rfp_camp_org_tenant_idx" on "partner_rfp_campaigns" ("organization_id", "tenant_id");`);
  }

}
