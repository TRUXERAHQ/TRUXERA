import { connectDatabase, db } from "./db";

export async function persistAuthenticatedUser(email: string, name: string) {
  await connectDatabase();

  const normalizedEmail = email.trim().toLowerCase();

  return db.orm.public.User.where({ email: normalizedEmail })
    .select("id", "email", "name")
    .upsert({
      create: {
        email: normalizedEmail,
        name: name.trim() || normalizedEmail,
      },
      update: {
        name: name.trim() || normalizedEmail,
      },
    });
}
