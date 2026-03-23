import { Migration } from '@mikro-orm/migrations'

export class Migration20260323141336 extends Migration {
  override async up(): Promise<void> {
    // TierAssignment — immutable tier-change audit trail
    this.addSql(`create table "tier_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tier" text not null, "effective_date" timestamptz not null, "approved_by" uuid not null, "reason" text null, "tenant_id" uuid not null, "created_at" timestamptz not null, constraint "tier_assignments_pkey" primary key ("id"));`)
    this.addSql(`create index "ta_org_tenant_idx" on "tier_assignments" ("organization_id", "tenant_id");`)

    // TierChangeProposal — upgrade/downgrade awaiting PM approval
    this.addSql(`create table "tier_change_proposals" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "evaluation_month" text not null, "current_tier" text not null, "proposed_tier" text not null, "type" text not null, "status" text not null default 'PendingApproval', "rejection_reason" text null, "wic_snapshot" real not null, "wip_snapshot" int not null, "min_snapshot" int not null, "resolved_at" timestamptz null, "tenant_id" uuid not null, "created_at" timestamptz not null, constraint "tier_change_proposals_pkey" primary key ("id"));`)
    this.addSql(`create index "tcp_org_month_idx" on "tier_change_proposals" ("organization_id", "evaluation_month");`)

    // TierEvaluationState — monthly evaluation snapshot per agency
    this.addSql(`create table "tier_evaluation_states" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "current_tier" text not null, "evaluation_month" text not null, "grace_period_started_at" timestamptz null, "status" text not null default 'OK', "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "tier_evaluation_states_pkey" primary key ("id"));`)
    this.addSql(`alter table "tier_evaluation_states" add constraint "tes_org_month_unique" unique ("organization_id", "evaluation_month", "tenant_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tier_evaluation_states" cascade;`)
    this.addSql(`drop table if exists "tier_change_proposals" cascade;`)
    this.addSql(`drop table if exists "tier_assignments" cascade;`)
  }
}
