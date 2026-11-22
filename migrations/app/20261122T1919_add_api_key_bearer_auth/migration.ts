#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1db3d24febeedcdc9a9161411e317cd68cce5d8f59385705f709b5f483db855d/contract';
import endContract from '../../snapshots/1db3d24febeedcdc9a9161411e317cd68cce5d8f59385705f709b5f483db855d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/23ac9f37dcdd14a92d7ec27711f271f6c8d57a301d47be01e757685a91105d67/contract';
import startContract from '../../snapshots/23ac9f37dcdd14a92d7ec27711f271f6c8d57a301d47be01e757685a91105d67/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Integration',
        constraint: 'Integration_authKind_check_1a81fa33',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'IntegrationCredential',
        constraint: 'IntegrationCredential_authKind_check_1a81fa33',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Integration',
        constraint: 'Integration_authKind_check_e98b4581',
        expression: sql`"authKind" IN ('API_KEY', 'API_KEY_BEARER', 'OAUTH2', 'BEARER_TOKEN', 'BASIC')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'IntegrationCredential',
        constraint: 'IntegrationCredential_authKind_check_e98b4581',
        expression: sql`"authKind" IN ('API_KEY', 'API_KEY_BEARER', 'OAUTH2', 'BEARER_TOKEN', 'BASIC')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
