#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3dc79afc3517d4709c4691a9613720554d9011726ccdd2babd156faf39424e19/contract';
import startContract from '../../snapshots/3dc79afc3517d4709c4691a9613720554d9011726ccdd2babd156faf39424e19/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8490377061788be334493616526a859184e01343ec760f07394425dfba2a2b30/contract';
import endContract from '../../snapshots/8490377061788be334493616526a859184e01343ec760f07394425dfba2a2b30/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
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
        table: 'OperationalSignal',
        columns: [
          col('clockSkew', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('dedupeKey', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('eventId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('ingestedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('integrationId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('provenance', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sequence', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('signalKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceTimestamp', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('subjectId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('subjectKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'OperationalSignal_subjectKind_check_e30d2d3c',
            sql`"subjectKind" IN ('TRUCK', 'DRIVER', 'DELIVERY', 'LOAD')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'OperationalSignalLatest',
        columns: [
          col('conflict', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('provenance', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('signalId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('signalKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceTimestamp', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('subjectId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('subjectKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'OperationalSignalLatest_subjectKind_check_e30d2d3c',
            sql`"subjectKind" IN ('TRUCK', 'DRIVER', 'DELIVERY', 'LOAD')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'OperationalSignal',
        constraint: 'OperationalSignal_organizationId_providerKey_subjectKind_subjec',
        columns: [
          'organizationId',
          'providerKey',
          'subjectKind',
          'subjectId',
          'signalKind',
          'sourceTimestamp',
          'dedupeKey',
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'OperationalSignalLatest',
        constraint: 'OperationalSignalLatest_organizationId_providerKey_subjectKind_',
        columns: ['organizationId', 'providerKey', 'subjectKind', 'subjectId', 'signalKind'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OperationalSignal',
        index: 'OperationalSignal_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OperationalSignal',
        index: 'opsignal_integration_idx_9775827b',
        columns: ['organizationId', 'integrationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OperationalSignal',
        index: 'opsignal_subject_idx_798ddcc0',
        columns: ['organizationId', 'subjectKind', 'subjectId', 'signalKind', 'sourceTimestamp'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OperationalSignalLatest',
        index: 'OperationalSignalLatest_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OperationalSignalLatest',
        index: 'opsignal_latest_subject_idx_a85508cb',
        columns: ['organizationId', 'subjectKind', 'subjectId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'OperationalSignal',
        foreignKey: {
          name: 'OperationalSignal_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'OperationalSignal',
        foreignKey: {
          name: 'OperationalSignal_organizationId_integrationId_fkey',
          columns: ['organizationId', 'integrationId'],
          references: { schema: 'public', table: 'Integration', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'OperationalSignalLatest',
        foreignKey: {
          name: 'OperationalSignalLatest_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
