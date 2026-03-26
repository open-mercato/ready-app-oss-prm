import { Migration } from '@mikro-orm/migrations';

export class Migration20260325120743 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "partner_rfp_responses" ("id" uuid not null default gen_random_uuid(), "campaign_id" uuid not null, "organization_id" uuid not null, "response_text" text not null, "submitted_by" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "partner_rfp_responses_pkey" primary key ("id"));`);
    this.addSql(`create index "rfp_resp_tenant_idx" on "partner_rfp_responses" ("tenant_id");`);
    this.addSql(`alter table "partner_rfp_responses" add constraint "rfp_resp_camp_org_idx" unique ("campaign_id", "organization_id");`);
  }

}
