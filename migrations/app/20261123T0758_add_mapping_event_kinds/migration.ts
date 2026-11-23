#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1db3d24febeedcdc9a9161411e317cd68cce5d8f59385705f709b5f483db855d/contract';
import startContract from '../../snapshots/1db3d24febeedcdc9a9161411e317cd68cce5d8f59385705f709b5f483db855d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/3dc79afc3517d4709c4691a9613720554d9011726ccdd2babd156faf39424e19/contract';
import endContract from '../../snapshots/3dc79afc3517d4709c4691a9613720554d9011726ccdd2babd156faf39424e19/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'IntegrationEvent',
        constraint: 'IntegrationEvent_kind_check_1da3be58',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'IntegrationEvent',
        constraint: 'IntegrationEvent_kind_check_cb9dddca',
        expression: sql`"kind" IN ('CONNECTED', 'DISCONNECTED', 'CONFIG_UPDATED', 'CREDENTIAL_STORED', 'CREDENTIAL_ROTATED', 'CREDENTIAL_REVOKED', 'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED', 'WEBHOOK_RECEIVED', 'WEBHOOK_PROCESSED', 'WEBHOOK_FAILED', 'EXTERNAL_RECORD_MAPPED', 'EXTERNAL_RECORD_MAPPING_FAILED')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
