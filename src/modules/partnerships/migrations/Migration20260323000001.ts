import { Migration } from '@mikro-orm/migrations';

export class Migration20260323000001 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "partner_license_deals" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "company_id" uuid not null, "license_identifier" text not null, "industry_tag" text not null, "type" text not null default 'enterprise', "status" text not null default 'won', "is_renewal" boolean not null default false, "closed_at" timestamptz not null, "year" integer not null, "created_by" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, constraint "partner_license_deals_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "pld_license_year_unique" on "partner_license_deals" ("license_identifier", "year");`);
    this.addSql(`create index if not exists "pld_org_tenant_idx" on "partner_license_deals" ("organization_id", "tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "partner_license_deals";`);
  }

}
