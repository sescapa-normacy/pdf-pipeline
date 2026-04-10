import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('processing_jobs', (table) => {
    table.uuid('id').primary();
    table
      .uuid('document_upload_id')
      .notNullable()
      .references('id')
      .inTable('document_uploads')
      .onDelete('CASCADE');
    table
      .enu('status', ['pending', 'running', 'completed', 'failed'])
      .notNullable()
      .defaultTo('pending');
    table.text('error_message').nullable();
    table.integer('chunks_count').nullable();
    table.integer('entities_count').nullable();
    // GCS prefix of curated output, e.g. "curated/{documentUploadId}"
    table.text('output_gcs_path').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('document_upload_id');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('processing_jobs');
}
