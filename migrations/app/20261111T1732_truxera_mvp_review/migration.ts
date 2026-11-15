#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4fa38d4a292f4725e95e20481126a3a478b08f28e59af065f103c6557714cf2b/contract';
import endContract from '../../snapshots/4fa38d4a292f4725e95e20481126a3a478b08f28e59af065f103c6557714cf2b/contract.json' with { type: 'json' };
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

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Delivery',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deliveredAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deliveryWindowEnd', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deliveryWindowStart', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('destinationAddress', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('eta', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('loadId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('recipientName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('riskLevel', 'text', {
            notNull: true,
            default: lit('LOW'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PLANNED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('stopNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Delivery_riskLevel_check_da6cb930',
            sql`"riskLevel" IN ('LOW', 'MEDIUM', 'HIGH')`,
          ),
          checkExpression(
            'Delivery_status_check_3623dc9f',
            sql`"status" IN ('PLANNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'DeliveryEvent',
        columns: [
          col('actorUserId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('deliveryId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('fromStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('location', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('occurredAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('toStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'DeliveryEvent_fromStatus_check_b110cafd',
            sql`"fromStatus" IN ('PLANNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')`,
          ),
          checkExpression(
            'DeliveryEvent_toStatus_check_91354a11',
            sql`"toStatus" IN ('PLANNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')`,
          ),
          checkExpression(
            'DeliveryEvent_type_check_66d1d21d',
            sql`"type" IN ('STATUS_CHANGED', 'ASSIGNMENT_CHANGED', 'ETA_UPDATED', 'DELIVERY_ATTEMPTED', 'EXCEPTION_REPORTED', 'LOCATION_UPDATED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'DispatchAssignment',
        columns: [
          col('assignedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('assignedByUserId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('deliveryId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('driverId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('endReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('truckId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Driver',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('licenseNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('AVAILABLE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Driver_status_check_03e84e5d',
            sql`"status" IN ('AVAILABLE', 'ON_DUTY', 'OFF_DUTY', 'ON_LEAVE', 'INACTIVE')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Load',
        columns: [
          col('cargoDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('customerName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('pickupAddress', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pickupWindowEnd', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('pickupWindowStart', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('weightKg', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Membership',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Membership_role_check_ade298bb',
            sql`"role" IN ('OWNER', 'ADMIN', 'DISPATCHER', 'DRIVER', 'VIEWER')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Organization',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('timezone', 'text', {
            notNull: true,
            default: lit('UTC'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Truck',
        columns: [
          col('capacityKg', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('currentLocation', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('locationUpdatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('AVAILABLE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('unitNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('vin', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Truck_status_check_3bb93199',
            sql`"status" IN ('AVAILABLE', 'ON_ROUTE', 'MAINTENANCE', 'OUT_OF_SERVICE')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Delivery',
        constraint: 'Delivery_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Delivery',
        constraint: 'Delivery_organizationId_loadId_stopNumber_key',
        columns: ['organizationId', 'loadId', 'stopNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Driver',
        constraint: 'Driver_organizationId_licenseNumber_key',
        columns: ['organizationId', 'licenseNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Driver',
        constraint: 'Driver_organizationId_userId_key',
        columns: ['organizationId', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Driver',
        constraint: 'Driver_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Load',
        constraint: 'Load_organizationId_reference_key',
        columns: ['organizationId', 'reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Load',
        constraint: 'Load_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Membership',
        constraint: 'Membership_organizationId_userId_key',
        columns: ['organizationId', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Organization',
        constraint: 'Organization_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Truck',
        constraint: 'Truck_organizationId_unitNumber_key',
        columns: ['organizationId', 'unitNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Truck',
        constraint: 'Truck_organizationId_id_key',
        columns: ['organizationId', 'id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Delivery',
        index: 'Delivery_organizationId_eta_idx_22f7abe7',
        columns: ['organizationId', 'eta'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Delivery',
        index: 'Delivery_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Delivery',
        index: 'Delivery_organizationId_loadId_idx_6e7b5157',
        columns: ['organizationId', 'loadId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Delivery',
        index: 'Delivery_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeliveryEvent',
        index: 'DeliveryEvent_actorUserId_idx_96dac96c',
        columns: ['actorUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeliveryEvent',
        index: 'DeliveryEvent_organizationId_deliveryId_idx_6274176d',
        columns: ['organizationId', 'deliveryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeliveryEvent',
        index: 'DeliveryEvent_organizationId_deliveryId_occurredAt_idx_5a875d24',
        columns: ['organizationId', 'deliveryId', 'occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'DispatchAssignment_assignedByUserId_idx_2ceeeec9',
        columns: ['assignedByUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'DispatchAssignment_organizationId_deliveryId_idx_6274176d',
        columns: ['organizationId', 'deliveryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'DispatchAssignment_organizationId_driverId_endedAt_idx_c35a8417',
        columns: ['organizationId', 'driverId', 'endedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'DispatchAssignment_organizationId_driverId_idx_bf04388f',
        columns: ['organizationId', 'driverId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'DispatchAssignment_organizationId_truckId_endedAt_idx_be6bbf15',
        columns: ['organizationId', 'truckId', 'endedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'DispatchAssignment_organizationId_truckId_idx_47b6ba1a',
        columns: ['organizationId', 'truckId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'dispatch_active_delivery_unique_b0c52623',
        columns: ['organizationId', 'deliveryId'],
        extras: { where: sql`"endedAt" IS NULL`, unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'DispatchAssignment',
        index: 'dispatch_delivery_assigned_idx_e0f3d2e1',
        columns: ['organizationId', 'deliveryId', 'assignedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Driver',
        index: 'Driver_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Driver',
        index: 'Driver_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Driver',
        index: 'Driver_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Load',
        index: 'Load_organizationId_createdAt_idx_c52d1cc3',
        columns: ['organizationId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Load',
        index: 'Load_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Membership',
        index: 'Membership_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Membership',
        index: 'Membership_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Truck',
        index: 'Truck_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Truck',
        index: 'Truck_organizationId_status_idx_21af5e82',
        columns: ['organizationId', 'status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Delivery',
        foreignKey: {
          name: 'Delivery_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Delivery',
        foreignKey: {
          name: 'Delivery_organizationId_loadId_fkey',
          columns: ['organizationId', 'loadId'],
          references: { schema: 'public', table: 'Load', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DeliveryEvent',
        foreignKey: {
          name: 'DeliveryEvent_organizationId_deliveryId_fkey',
          columns: ['organizationId', 'deliveryId'],
          references: { schema: 'public', table: 'Delivery', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DeliveryEvent',
        foreignKey: {
          name: 'DeliveryEvent_actorUserId_fkey',
          columns: ['actorUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DispatchAssignment',
        foreignKey: {
          name: 'DispatchAssignment_organizationId_deliveryId_fkey',
          columns: ['organizationId', 'deliveryId'],
          references: { schema: 'public', table: 'Delivery', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DispatchAssignment',
        foreignKey: {
          name: 'DispatchAssignment_organizationId_truckId_fkey',
          columns: ['organizationId', 'truckId'],
          references: { schema: 'public', table: 'Truck', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DispatchAssignment',
        foreignKey: {
          name: 'DispatchAssignment_organizationId_driverId_fkey',
          columns: ['organizationId', 'driverId'],
          references: { schema: 'public', table: 'Driver', columns: ['organizationId', 'id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DispatchAssignment',
        foreignKey: {
          name: 'DispatchAssignment_assignedByUserId_fkey',
          columns: ['assignedByUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Driver',
        foreignKey: {
          name: 'Driver_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Driver',
        foreignKey: {
          name: 'Driver_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Load',
        foreignKey: {
          name: 'Load_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Membership',
        foreignKey: {
          name: 'Membership_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'public', table: 'Organization', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Membership',
        foreignKey: {
          name: 'Membership_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Truck',
        foreignKey: {
          name: 'Truck_organizationId_fkey',
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
