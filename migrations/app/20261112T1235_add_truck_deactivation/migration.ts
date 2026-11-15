#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4fa38d4a292f4725e95e20481126a3a478b08f28e59af065f103c6557714cf2b/contract';
import startContract from '../../snapshots/4fa38d4a292f4725e95e20481126a3a478b08f28e59af065f103c6557714cf2b/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cc16f51263ef0ba4a603b035e41f70961c47d63c79335be52624a56e0d504c6c/contract';
import endContract from '../../snapshots/cc16f51263ef0ba4a603b035e41f70961c47d63c79335be52624a56e0d504c6c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Truck',
        column: col('deactivatedAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
