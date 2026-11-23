#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/300ce5325c8c5bddd17d3e0a25a6868c62140556702255fbcd1fd3df601e13ef/contract';
import startContract from '../../snapshots/300ce5325c8c5bddd17d3e0a25a6868c62140556702255fbcd1fd3df601e13ef/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6a494d6e54e0095e853009b688661a4771d8672c155d22b6ddcab23b71461154/contract';
import endContract from '../../snapshots/6a494d6e54e0095e853009b688661a4771d8672c155d22b6ddcab23b71461154/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'BillingWebhookEvent',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('providerEventId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('RECEIVED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'BillingSubscription',
        column: col('providerCustomerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'BillingWebhookEvent',
        constraint: 'BillingWebhookEvent_providerKey_providerEventId_key',
        columns: ['providerKey', 'providerEventId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
