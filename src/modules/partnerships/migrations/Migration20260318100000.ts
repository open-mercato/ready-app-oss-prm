import { Migration } from '@mikro-orm/migrations';

export class Migration20260318100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "partner_agencies" add column "name" text null;`);

    this.addSql(`alter table "partner_rfp_campaigns" add column "description" text null, add column "audience" text not null default 'all', add column "invited_agency_ids" jsonb null, add column "deadline" timestamptz null;`);

    this.addSql(`alter table "partner_rfp_responses" add column "content" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "partner_agencies" drop column "name";`);

    this.addSql(`alter table "partner_rfp_campaigns" drop column "description", drop column "audience", drop column "invited_agency_ids", drop column "deadline";`);

    this.addSql(`alter table "partner_rfp_responses" drop column "content";`);
  }
}
