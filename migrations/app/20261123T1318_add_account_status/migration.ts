#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8490377061788be334493616526a859184e01343ec760f07394425dfba2a2b30/contract';
import startContract from '../../snapshots/8490377061788be334493616526a859184e01343ec760f07394425dfba2a2b30/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/879e25aca4ee97932ef634f7fb219bb4355b245e20a2ebac0bdb84cc8225862c/contract';
import endContract from '../../snapshots/879e25aca4ee97932ef634f7fb219bb4355b245e20a2ebac0bdb84cc8225862c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'IntegrationEvent',
        constraint: 'IntegrationEvent_kind_check_cb9dddca',
      }),
      this.addColumn({
        schema: 'public',
        table: 'Organization',
        column: col('status', 'text', {
          notNull: true,
          default: lit('ACTIVE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'IntegrationEvent',
        constraint: 'IntegrationEvent_kind_check_61abe518',
        expression: sql`"kind" IN ('CONNECTED', 'DISCONNECTED', 'CONFIG_UPDATED', 'CREDENTIAL_STORED', 'CREDENTIAL_ROTATED', 'CREDENTIAL_REVOKED', 'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED', 'WEBHOOK_RECEIVED', 'WEBHOOK_PROCESSED', 'WEBHOOK_FAILED', 'EXTERNAL_RECORD_MAPPED', 'EXTERNAL_RECORD_MAPPING_FAILED', 'ACCOUNT_STATUS_CHANGED')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Organization',
        constraint: 'Organization_status_check_1527ac15',
        expression: sql`"status" IN ('ACTIVE', 'SUSPENDED')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
