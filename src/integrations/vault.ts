import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { IntegrationError } from "./errors.ts";
import {
  serializeCredentialForStorage,
  parseStoredCredential,
  credentialMetadata,
  type CredentialMetadata,
  type IntegrationCredentialPayload,
} from "./auth.ts";

export interface CredentialCipher {
  encrypt(plaintext: string): Promise<{ ciphertext: string; keyVersion: string }>;
  decrypt(input: { ciphertext: string; keyVersion: string }): Promise<string>;
}

export interface StoredCredentialRecord {
  ciphertext: string;
  keyVersion: string;
  hint: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface CredentialRepository {
  saveCredential(input: {
    organizationId: string;
    integrationId: string;
    authKind: string;
    ciphertext: string;
    keyVersion: string;
    hint: string | null;
    expiresAt: Date | null;
  }): Promise<void>;
  getCredential(input: {
    organizationId: string;
    integrationId: string;
  }): Promise<StoredCredentialRecord | null>;
  revokeCredential(input: {
    organizationId: string;
    integrationId: string;
  }): Promise<void>;
}

const ENV_KEY_NAME = "INTEGRATION_CREDENTIALS_KEY";
const KEY_VERSION = "env-v1";

function loadKey(): Buffer {
  const raw = process.env[ENV_KEY_NAME];
  if (!raw) {
    throw new IntegrationError(
      "CREDENTIAL_UNAVAILABLE",
      `${ENV_KEY_NAME} is not configured; integration credentials cannot be stored.`,
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    const hashed = createHash("sha256").update(raw).digest();
    return hashed;
  }
  return key;
}

export function createAesGcmCredentialCipher(
  keyProvider: () => Buffer = loadKey,
): CredentialCipher {
  return {
    async encrypt(plaintext: string) {
      const key = keyProvider();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const payload = Buffer.concat([iv, tag, encrypted]);
      return {
        ciphertext: `v1:${payload.toString("base64")}`,
        keyVersion: KEY_VERSION,
      };
    },
    async decrypt({ ciphertext, keyVersion }) {
      if (keyVersion !== KEY_VERSION || !ciphertext.startsWith("v1:")) {
        throw new IntegrationError(
          "CREDENTIAL_UNAVAILABLE",
          "Stored credential uses an unsupported key version.",
        );
      }
      const key = keyProvider();
      const payload = Buffer.from(ciphertext.slice(3), "base64");
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      try {
        return Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new IntegrationError(
          "CREDENTIAL_UNAVAILABLE",
          "Stored credential could not be decrypted.",
        );
      }
    },
  };
}

export class IntegrationCredentialVault {
  private readonly repository: CredentialRepository;
  private readonly cipher: CredentialCipher;

  constructor(
    repository: CredentialRepository,
    cipher: CredentialCipher = createAesGcmCredentialCipher(),
  ) {
    this.repository = repository;
    this.cipher = cipher;
  }

  async storeCredential(input: {
    organizationId: string;
    integrationId: string;
    credential: IntegrationCredentialPayload;
  }): Promise<CredentialMetadata> {
    const plaintext = serializeCredentialForStorage(input.credential);
    const { ciphertext, keyVersion } = await this.cipher.encrypt(plaintext);
    const metadata = credentialMetadata(input.credential);
    await this.repository.saveCredential({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      authKind: metadata.kind,
      ciphertext,
      keyVersion,
      hint: metadata.hint,
      expiresAt: metadata.expiresAt,
    });
    return metadata;
  }

  async retrieveCredential(input: {
    organizationId: string;
    integrationId: string;
  }): Promise<IntegrationCredentialPayload> {
    const record = await this.repository.getCredential(input);
    if (!record || record.revokedAt) {
      throw new IntegrationError(
        "CREDENTIAL_UNAVAILABLE",
        "No active credential is stored for this integration.",
      );
    }
    const plaintext = await this.cipher.decrypt({
      ciphertext: record.ciphertext,
      keyVersion: record.keyVersion,
    });
    return parseStoredCredential(plaintext);
  }

  async revokeCredential(input: {
    organizationId: string;
    integrationId: string;
  }): Promise<void> {
    await this.repository.revokeCredential(input);
  }
}
