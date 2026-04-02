import { Migration } from '@mikro-orm/migrations';

export class Migration20260402000002 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`update "roles" set "name" = 'agency_admin' where "name" = 'partner_admin';`);
    this.addSql(`update "roles" set "name" = 'agency_business_developer' where "name" = 'partner_member';`);
    this.addSql(`update "roles" set "name" = 'agency_developer' where "name" = 'partner_contributor';`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "roles" set "name" = 'partner_admin' where "name" = 'agency_admin';`);
    this.addSql(`update "roles" set "name" = 'partner_member' where "name" = 'agency_business_developer';`);
    this.addSql(`update "roles" set "name" = 'partner_contributor' where "name" = 'agency_developer';`);
  }

}
