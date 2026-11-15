import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

export const db = postgres({ contract });

let connectionPromise: Promise<void> | undefined;

export async function connectDatabase() {
  if (!connectionPromise) {
    const url = process.env["DATABASE_URL"];
    if (!url) {
      throw new Error("DATABASE_URL must be configured to load dashboard data.");
    }

    connectionPromise = db.connect({ url }).then(() => undefined);
  }

  await connectionPromise;
}
