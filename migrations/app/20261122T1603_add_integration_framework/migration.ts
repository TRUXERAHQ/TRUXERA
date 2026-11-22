#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0c7fbdb13d046bcf0a03d6153d959cb97a9ca15ec0b67e8564df2a48fc5166d1/contract';
import startContract from '../../snapshots/0c7fbdb13d046bcf0a03d6153d959cb97a9ca15ec0b67e8564df2a48fc5166d1/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/91e5f4fb38507bec9c1c6e00b65c27e7515ee9518190100ad7c77230baa984b2/contract';
import endContract from '../../snapshots/91e5f4fb38507bec9c1c6e00b65c27e7515ee9518190100ad7c77230baa984b2/contract.json' with { type: 'json' };
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
        table: 'ExternalRecord',
        columns: [
          col('checksum', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('entityKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('externalId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('integrationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('internalId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('internalKind', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastSyncedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('providerKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ExternalRecord_entityKind_check_54d9be9f',
            sql`"entityKind" IN ('LOAD', 'DELIVERY', 'TRUCK', 'DRIVER', 'ASSIGNMENT', 'CUSTOMER')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Integration',
        columns: [
          col('authKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('capabilities', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('config', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('consecutiveFailures', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdByUserId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('displayName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lastSuccessfulSyncAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('lastSyncAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('lastSyncError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('providerKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recordsFailed', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recordsProcessed', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DISCONNECTED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('syncCursor', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('webhookTokenHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Integration_authKind_check_1a81fa33',
            sql`"authKind" IN ('API_KEY', 'OAUTH2', 'BEARER_TOKEN', 'BASIC')`,
          ),
          checkExpression(
            'Integration_status_check_1043d03e',
            sql`"status" IN ('CONNECTING', 'CONNECTED', 'SYNCING', 'DEGRADED', 'ERROR', 'DISCONNECTED')`,
          ),
          checkExpression(
            'Integration_type_check_f2a848c5',
            sql`"type" IN ('TMS', 'ELD', 'GPS_TELEMATICS', 'OTHER')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'IntegrationCredential',
        columns: [
          col('authKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ciphertext', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('hint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('integrationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('keyVersion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('revokedAt', 'timestamptz(3)', {
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
            'IntegrationCredential_authKind_check_1a81fa33',
            sql`"authKind" IN ('API_KEY', 'OAUTH2', 'BEARER_TOKEN', 'BASIC')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'IntegrationEvent',
        columns: [
          col('actorUserId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('integrationId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'IntegrationEvent_kind_check_1da3be58',
            sql`"kind" IN ('CONNECTED', 'DISCONNECTED', 'CONFIG_UPDATED', 'CREDENTIAL_STORED', 'CREDENTIAL_ROTATED', 'CREDENTIAL_REVOKED', 'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED', 'WEBHOOK_RECEIVED', 'WEBHOOK_PROCESSED', 'WEBHOOK_FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'IntegrationSyncRun',
        columns: [
          col('cursorAfter', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cursorBefore', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('errorCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('errorSummary', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finishedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('initiatedByUserId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('integrationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('recordsCreated', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recordsFailed', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recordsSeen', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recordsUpdated', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('startedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('RUNNING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('trigger', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'IntegrationSyncRun_status_check_312222e2',
            sql`"status" IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL')`,
          ),
          checkExpression(
            'IntegrationSyncRun_trigger_check_42c3cef3',
            sql`"trigger" IN ('INITIAL', 'INCREMENTAL', 'MANUAL', 'SCHEDULED', 'WEBHOOK')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('eventType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('externalEventId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('integrationId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('lastError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('payload', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('payloadHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('processedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('providerKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('receivedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('RECEIVED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'IntegrationWebhookEvent_status_check_bd99edcb',
            sql`"status" IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ExternalRecord',
        constraint: 'ExternalRecord_organizationId_providerKey_entityKind_externalId',
        columns: ['organizationId', 'providerKey', 'entityKind', 'externalId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ExternalRecord',
        constraint: 'ExternalRecord_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Integration',
        constraint: 'Integration_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'IntegrationCredential',
        constraint: 'IntegrationCredential_organizationId_integrationId_key',
        columns: ['organizationId', 'integrationId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        constraint: 'IntegrationWebhookEvent_organizationId_providerKey_externalEven',
        columns: ['organizationId', 'providerKey', 'externalEventId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ExternalRecord',
        index: 'ExternalRecord_organizationId_entityKind_idx_2c710837',
        columns: ['organizationId', 'entityKind'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ExternalRecord',
        index: 'ExternalRecord_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ExternalRecord',
        index: 'ExternalRecord_organizationId_integrationId_idx_9775827b',
        columns: ['organizationId', 'integrationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ExternalRecord',
        index: 'external_record_internal_idx_254c7fe8',
        columns: ['organizationId', 'internalKind', 'internalId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Integration',
        index: 'Integration_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Integration',
        index: 'Integration_organizationId_providerKey_idx_fcc6e7b5',
        columns: ['organizationId', 'providerKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Integration',
        index: 'Integration_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationCredential',
        index: 'IntegrationCredential_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationEvent',
        index: 'IntegrationEvent_actorUserId_idx_96dac96c',
        columns: ['actorUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationEvent',
        index: 'IntegrationEvent_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationEvent',
        index: 'IntegrationEvent_organizationId_integrationId_idx_9775827b',
        columns: ['organizationId', 'integrationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationEvent',
        index: 'integration_event_created_idx_193b1373',
        columns: ['organizationId', 'integrationId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationSyncRun',
        index: 'IntegrationSyncRun_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationSyncRun',
        index: 'IntegrationSyncRun_organizationId_integrationId_idx_9775827b',
        columns: ['organizationId', 'integrationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationSyncRun',
        index: 'integration_syncrun_started_idx_5919ee49',
        columns: ['organizationId', 'integrationId', 'startedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        index: 'IntegrationWebhookEvent_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        index: 'IntegrationWebhookEvent_organizationId_integrationId_i_9775827b',
        columns: ['organizationId', 'integrationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        index: 'integration_webhook_received_idx_d0d8ce19',
        columns: ['organizationId', 'integrationId', 'receivedAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ExternalRecord',
        foreignKey: {
          name: 'ExternalRecord_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ExternalRecord',
        foreignKey: {
          name: 'ExternalRecord_organizationId_integrationId_fkey',
          columns: ['organizationId', 'integrationId'],
          references: { schema: 'public', table: 'Integration', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Integration',
        foreignKey: {
          name: 'Integration_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationCredential',
        foreignKey: {
          name: 'IntegrationCredential_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationCredential',
        foreignKey: {
          name: 'IntegrationCredential_organizationId_integrationId_fkey',
          columns: ['organizationId', 'integrationId'],
          references: { schema: 'public', table: 'Integration', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationEvent',
        foreignKey: {
          name: 'IntegrationEvent_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationEvent',
        foreignKey: {
          name: 'IntegrationEvent_organizationId_integrationId_fkey',
          columns: ['organizationId', 'integrationId'],
          references: { schema: 'public', table: 'Integration', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationSyncRun',
        foreignKey: {
          name: 'IntegrationSyncRun_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationSyncRun',
        foreignKey: {
          name: 'IntegrationSyncRun_organizationId_integrationId_fkey',
          columns: ['organizationId', 'integrationId'],
          references: { schema: 'public', table: 'Integration', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        foreignKey: {
          name: 'IntegrationWebhookEvent_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'IntegrationWebhookEvent',
        foreignKey: {
          name: 'IntegrationWebhookEvent_organizationId_integrationId_fkey',
          columns: ['organizationId', 'integrationId'],
          references: { schema: 'public', table: 'Integration', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
