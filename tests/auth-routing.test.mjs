import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const loginPage = readFileSync(
  new URL("../app/login/page.tsx", import.meta.url),
  "utf8",
);
const signupPage = readFileSync(
  new URL("../app/signup/page.tsx", import.meta.url),
  "utf8",
);
const onboardingPage = readFileSync(
  new URL("../app/onboarding/page.tsx", import.meta.url),
  "utf8",
);
const dashboardPage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("proxy authenticates on session.user.id, not bare session presence", () => {
  // Regression: proxy previously used `request.auth` truthiness while pages
  // require `session?.user?.id`. A session without user.id made "/" and
  // "/login" redirect to each other forever (signup/login trap).
  assert.match(proxy, /request\.auth\?\.user\?\.id/);
  assert.doesNotMatch(proxy, /!request\.auth\b/);
  assert.doesNotMatch(proxy, /request\.auth && publicAuthPaths/);
});

test("proxy keeps /login and /signup public for logged-out visitors", () => {
  assert.match(proxy, /publicAuthPaths = \["\/login", "\/signup"\]/);
  assert.match(proxy, /!userId && !publicAuthPaths\.includes\(pathname\)/);
  assert.match(proxy, /userId && publicAuthPaths\.includes\(pathname\)/);
});

test("auth pages and onboarding use the same session.user.id predicate", () => {
  for (const page of [loginPage, signupPage]) {
    assert.match(page, /session\?\.user\?\.id/);
    assert.match(page, /redirect\("\/"\)/);
  }
  assert.match(onboardingPage, /!session\?\.user\?\.id.*redirect\("\/login"\)/s);
  assert.match(onboardingPage, /organizations\.length > 0.*redirect\("\/"\)/s);
});

test("dashboard routes zero-organization users to /onboarding", () => {
  assert.match(dashboardPage, /!session\?\.user\?\.id.*redirect\("\/login"\)/s);
  assert.match(dashboardPage, /organizations\.length === 0.*redirect\("\/onboarding"\)/s);
});
