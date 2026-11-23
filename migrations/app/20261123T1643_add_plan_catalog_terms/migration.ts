#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/300ce5325c8c5bddd17d3e0a25a6868c62140556702255fbcd1fd3df601e13ef/contract';
import endContract from '../../snapshots/300ce5325c8c5bddd17d3e0a25a6868c62140556702255fbcd1fd3df601e13ef/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f59ebd0df81da3ea784f06a49876a5f691027af2d6ec48eac42f12c2ac935003/contract';
import startContract from '../../snapshots/f59ebd0df81da3ea784f06a49876a5f691027af2d6ec48eac42f12c2ac935003/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'BillingSubscription',
        constraint: 'BillingSubscription_plan_check_b703cbe4',
      }),
      this.addColumn({
        schema: 'public',
        table: 'BillingSubscription',
        column: col('annualPriceCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'BillingSubscription',
        column: col('integrationLimit', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'BillingSubscription',
        column: col('monthlyPriceCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'BillingSubscription',
        column: col('vehicleLimit', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'BillingSubscription',
        constraint: 'BillingSubscription_plan_check_c4b4585e',
        expression: sql`"plan" IN ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
