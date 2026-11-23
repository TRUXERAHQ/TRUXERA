import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_SUSPENDED_ERROR,
  ACCOUNT_STATUSES,
  canManageAccountStatus,
  isAccountStatus,
  isAccountWritable,
  parseAccountStatusChange,
} from "../src/account/account-status.ts";

test("account statuses are limited to ACTIVE and SUSPENDED", () => {
  assert.deepEqual([...ACCOUNT_STATUSES].sort(), ["ACTIVE", "SUSPENDED"]);
  assert.equal(isAccountStatus("ACTIVE"), true);
  assert.equal(isAccountStatus("SUSPENDED"), true);
  for (const invalid of [
    "TRIAL",
    "PAST_DUE",
    "CANCELLED",
    "CHURNED",
    "active",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isAccountStatus(invalid), false, String(invalid));
  }
});

test("suspension requires explicit confirmation", () => {
  assert.equal(
    parseAccountStatusChange({ status: "SUSPENDED" }).ok,
    false,
  );
  assert.equal(
    parseAccountStatusChange({ status: "SUSPENDED", confirm: "yes" }).ok,
    false,
  );
  const confirmed = parseAccountStatusChange({
    status: "SUSPENDED",
    confirm: "SUSPEND",
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.target, "SUSPENDED");
});

test("reactivation does not require confirmation", () => {
  const result = parseAccountStatusChange({ status: "ACTIVE" });
  assert.equal(result.ok, true);
  assert.equal(result.target, "ACTIVE");
});

test("invalid status targets are rejected", () => {
  for (const status of ["TRIAL", "CANCELLED", "", null, undefined]) {
    const result = parseAccountStatusChange({ status });
    assert.equal(result.ok, false, String(status));
  }
});

test("writability gate fails closed for non-ACTIVE statuses", () => {
  assert.equal(isAccountWritable("ACTIVE"), true);
  assert.equal(isAccountWritable("SUSPENDED"), false);
  assert.equal(isAccountWritable(undefined), false);
  assert.equal(isAccountWritable(null), false);
});

test("account status changes are restricted to OWNER and ADMIN", () => {
  assert.equal(canManageAccountStatus("OWNER"), true);
  assert.equal(canManageAccountStatus("ADMIN"), true);
  assert.equal(canManageAccountStatus("DISPATCHER"), false);
  assert.equal(canManageAccountStatus("DRIVER"), false);
  assert.equal(canManageAccountStatus("VIEWER"), false);
  assert.equal(canManageAccountStatus(null), false);
  assert.equal(canManageAccountStatus(undefined), false);
});

test("suspended error message does not delete or threaten data", () => {
  assert.match(ACCOUNT_SUSPENDED_ERROR, /suspended/i);
  assert.doesNotMatch(ACCOUNT_SUSPENDED_ERROR, /delet|remov|purge/i);
});
