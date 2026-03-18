import { Migration } from '@mikro-orm/migrations';

export class Migration20260318014229 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "partner_license_deals" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "customer_id" uuid not null, "deal_type" text not null, "status" text not null default 'pending', "is_renewal" boolean not null default false, "partner_agency_id" uuid null, "attributed_at" timestamptz null, "attributed_by_user_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "partner_license_deals_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_partner_license_deals_tenant_org" on "partner_license_deals" ("tenant_id", "organization_id");`);

    this.addSql(`create table "partner_wic_contribution_units" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "wic_run_id" uuid not null, "partner_agency_id" uuid null, "gh_profile" text not null, "month_key" text not null, "feature_key" text null, "base_score" numeric(10,0) not null, "impact_bonus" numeric(10,0) not null default 0, "bounty_multiplier" numeric(10,0) not null default 1, "wic_final" numeric(10,0) not null, "wic_level" text null, "bounty_bonus" numeric(10,0) not null default 0, "included_reason" text null, "excluded_reason" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "partner_wic_contribution_units_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_partner_wic_units_tenant_org" on "partner_wic_contribution_units" ("tenant_id", "organization_id");`);
    this.addSql(`alter table "partner_wic_contribution_units" add constraint "uq_partner_wic_units_dedup" unique ("tenant_id", "organization_id", "gh_profile", "month_key", "feature_key");`);

    this.addSql(`create table "partner_wic_runs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "run_date" date not null, "period_start" date not null, "period_end" date not null, "script_version" text not null, "status" text not null default 'pending', "raw_output" text null, "imported_by_user_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "partner_wic_runs_pkey" primary key ("id"));`);
    this.addSql(`create index "idx_partner_wic_runs_tenant_org" on "partner_wic_runs" ("tenant_id", "organization_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "partner_wic_runs" cascade;`);
    this.addSql(`drop table if exists "partner_wic_contribution_units" cascade;`);
    this.addSql(`drop table if exists "partner_license_deals" cascade;`);
  }
}
