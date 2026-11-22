#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3a13d9ebe7d6a8dd333bf61fe12451aa5540d371141945a29a27e9b54c1065d5/contract';
import endContract from '../../snapshots/3a13d9ebe7d6a8dd333bf61fe12451aa5540d371141945a29a27e9b54c1065d5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cc16f51263ef0ba4a603b035e41f70961c47d63c79335be52624a56e0d504c6c/contract';
import startContract from '../../snapshots/cc16f51263ef0ba4a603b035e41f70961c47d63c79335be52624a56e0d504c6c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
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
        table: 'SupportMessage',
        columns: [
          col('authorKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('authorUserId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('requestId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'SupportMessage_authorKind_check_2c5d0987',
            sql`"authorKind" IN ('CUSTOMER', 'SUPPORT')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'SupportRequest',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('priority', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('relatedId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('relatedKind', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requesterUserId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('resolutionNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resolvedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'SupportRequest_category_check_bd93be99',
            sql`"category" IN ('TECHNICAL_ISSUE', 'DATA_ISSUE', 'ACCOUNT_ACCESS', 'FLEET_OPERATIONS', 'OTHER')`,
          ),
          checkExpression(
            'SupportRequest_priority_check_72dbae57',
            sql`"priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')`,
          ),
          checkExpression(
            'SupportRequest_relatedKind_check_a9833ed1',
            sql`"relatedKind" IN ('LOAD', 'DELIVERY', 'TRUCK', 'DRIVER')`,
          ),
          checkExpression(
            'SupportRequest_status_check_0918205c',
            sql`"status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'SupportRequest',
        constraint: 'SupportRequest_organizationId_reference_key',
        columns: ['organizationId', 'reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'SupportRequest',
        constraint: 'SupportRequest_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportMessage',
        index: 'SupportMessage_authorUserId_idx_d1814ea0',
        columns: ['authorUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportMessage',
        index: 'SupportMessage_organizationId_requestId_idx_f7ba17fc',
        columns: ['organizationId', 'requestId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_organizationId_createdAt_idx_c52d1cc3',
        columns: ['organizationId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_requesterUserId_idx_75bb1080',
        columns: ['requesterUserId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportMessage',
        foreignKey: {
          name: 'SupportMessage_organizationId_requestId_fkey',
          columns: ['organizationId', 'requestId'],
          references: {
            schema: 'public',
            table: 'SupportRequest',
            columns: ['organizationId', 'id'],
          },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportMessage',
        foreignKey: {
          name: 'SupportMessage_authorUserId_fkey',
          columns: ['authorUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportRequest',
        foreignKey: {
          name: 'SupportRequest_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportRequest',
        foreignKey: {
          name: 'SupportRequest_requesterUserId_fkey',
          columns: ['requesterUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
