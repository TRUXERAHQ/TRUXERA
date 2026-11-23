#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/879e25aca4ee97932ef634f7fb219bb4355b245e20a2ebac0bdb84cc8225862c/contract';
import startContract from '../../snapshots/879e25aca4ee97932ef634f7fb219bb4355b245e20a2ebac0bdb84cc8225862c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f59ebd0df81da3ea784f06a49876a5f691027af2d6ec48eac42f12c2ac935003/contract';
import endContract from '../../snapshots/f59ebd0df81da3ea784f06a49876a5f691027af2d6ec48eac42f12c2ac935003/contract.json' with { type: 'json' };
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
        table: 'BillingSubscription',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('plan', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('providerSubscriptionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('trialEndAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('trialStartAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'BillingSubscription_plan_check_b703cbe4',
            sql`"plan" IN ('TRIAL', 'PROFESSIONAL', 'ENTERPRISE')`,
          ),
          checkExpression(
            'BillingSubscription_status_check_06476f63',
            sql`"status" IN ('TRIAL', 'ACTIVE', 'PAUSED', 'CANCELED')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BillingSubscription',
        constraint: 'BillingSubscription_organizationId_key',
        columns: ['organizationId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BillingSubscription',
        foreignKey: {
          name: 'BillingSubscription_organizationId_fkey',
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
