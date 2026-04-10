import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('document_uploads', (table) => {
    table.uuid('id').primary();
    table.uuid('account_id').notNullable();
    table.text('file_name').notNullable();
    table.text('gcs_path').notNullable();
    table.enu('document_type', ['ctd_module3', 'supporting']).notNullable();
    // For supporting documents: CTD section this doc provides evidence for
    table.text('ctd_section').nullable();
    table
      .enu('status', ['uploaded', 'processing', 'curated', 'failed'])
      .notNullable()
      .defaultTo('uploaded');
    table.timestamp('uploaded_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('account_id');
    table.index('status');
    table.index('document_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('document_uploads');
}
