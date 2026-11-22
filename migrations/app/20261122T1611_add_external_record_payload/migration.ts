#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/23ac9f37dcdd14a92d7ec27711f271f6c8d57a301d47be01e757685a91105d67/contract';
import endContract from '../../snapshots/23ac9f37dcdd14a92d7ec27711f271f6c8d57a301d47be01e757685a91105d67/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/91e5f4fb38507bec9c1c6e00b65c27e7515ee9518190100ad7c77230baa984b2/contract';
import startContract from '../../snapshots/91e5f4fb38507bec9c1c6e00b65c27e7515ee9518190100ad7c77230baa984b2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ExternalRecord',
        column: col('payload', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
