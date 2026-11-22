#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0c7fbdb13d046bcf0a03d6153d959cb97a9ca15ec0b67e8564df2a48fc5166d1/contract';
import endContract from '../../snapshots/0c7fbdb13d046bcf0a03d6153d959cb97a9ca15ec0b67e8564df2a48fc5166d1/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/3a13d9ebe7d6a8dd333bf61fe12451aa5540d371141945a29a27e9b54c1065d5/contract';
import startContract from '../../snapshots/3a13d9ebe7d6a8dd333bf61fe12451aa5540d371141945a29a27e9b54c1065d5/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Feedback',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('rating', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Feedback_type_check_6728e517',
            sql`"type" IN ('PRODUCT_SUGGESTION', 'FEATURE_REQUEST', 'UX_UI_FEEDBACK', 'GENERAL_FEEDBACK')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Feedback',
        index: 'Feedback_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Feedback',
        index: 'Feedback_organizationId_userId_createdAt_idx_c40adf4c',
        columns: ['organizationId', 'userId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Feedback',
        index: 'Feedback_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Feedback',
        foreignKey: {
          name: 'Feedback_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Feedback',
        foreignKey: {
          name: 'Feedback_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
