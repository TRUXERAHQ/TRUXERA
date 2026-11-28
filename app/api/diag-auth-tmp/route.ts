import { connection, NextResponse } from "next/server";
import { auth } from "@/auth";
import { persistAuthenticatedUser } from "@/src/prisma/auth-data";
import { connectDatabase, db } from "@/src/prisma/db";

export async function GET() {
  await connection();
  const out: Record<string, unknown> = {};

  out.authUrl = process.env.AUTH_URL ?? null;
  out.authTrustHost = process.env.AUTH_TRUST_HOST ?? null;
  out.hasGoogleId = Boolean(process.env.AUTH_GOOGLE_ID);
  out.hasGoogleSecret = Boolean(process.env.AUTH_GOOGLE_SECRET);
  out.hasAuthSecret = Boolean(process.env.AUTH_SECRET);
  out.hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  try {
    const session = await auth();
    out.session = session
      ? { userId: session.user?.id ?? null, email: session.user?.email ?? null }
      : null;
  } catch (e) {
    out.sessionError = String(e).slice(0, 300);
  }

  try {
    await connectDatabase();
    const probe = await persistAuthenticatedUser(
      "diag-oauth-probe@truxera.invalid",
      "Diag OAuth Probe",
    );
    out.persistProbe = { ok: true, id: probe?.id ?? null };
    const memberships = await db.orm.public.Membership.where({
      userId: probe.id,
    }).all();
    out.probeMemberships = memberships.length;
  } catch (e) {
    out.persistProbe = { ok: false, error: String(e).slice(0, 500) };
  }

  return NextResponse.json(out);
}
