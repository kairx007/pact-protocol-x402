import { MongoClient, type Collection, type Db } from "mongodb";
import type {
  OrganizationRecord,
  RegisteredAgentRecord,
  CapabilityRecord,
  TreasuryRecord,
  TreasuryTransactionRecord,
} from "@pact/shared";
import { config } from "./config.js";

const client = new MongoClient(config.MONGODB_URI);
let db: Db | undefined;

export async function connectDatabase(): Promise<Db> {
  if (!db) {
    await client.connect();
    db = client.db(config.MONGODB_DATABASE);
    await Promise.all([
      db
        .collection("organizations")
        .createIndex({ organizationId: 1 }, { unique: true }),
      db.collection("organizations").createIndex({ slug: 1 }, { unique: true }),
      db.collection("agents").createIndex({ agentId: 1 }, { unique: true }),
      db.collection("agents").createIndex(
        {
          organizationId: 1,
          "identity.registryAddress": 1,
          "identity.agentId": 1,
          "identity.chainId": 1,
        },
        { unique: true },
      ),
      db
        .collection("treasuries")
        .createIndex({ treasuryId: 1 }, { unique: true }),
      db
        .collection("treasuries")
        .createIndex({ organizationId: 1, chainId: 1 }, { unique: true }),
      db
        .collection("treasuryTransactions")
        .createIndex(
          { treasuryId: 1, transactionHash: 1, logIndex: 1 },
          { unique: true },
        ),
      db
        .collection("treasuryTransactions")
        .createIndex({ treasuryId: 1, blockNumber: -1, logIndex: -1 }),
      db
        .collection("capabilities")
        .createIndex({ capabilityId: 1 }, { unique: true }),
      db
        .collection("capabilities")
        .createIndex({ organizationId: 1, agentId: 1, status: 1 }),
      db
        .collection("capabilities")
        .createIndex({ organizationId: 1, parentCapabilityId: 1 }),
    ]);
  }
  return db;
}

export async function collections(): Promise<{
  organizations: Collection<OrganizationRecord>;
  agents: Collection<RegisteredAgentRecord>;
  treasuries: Collection<TreasuryRecord>;
  treasuryTransactions: Collection<TreasuryTransactionRecord>;
  capabilities: Collection<CapabilityRecord>;
}> {
  const database = await connectDatabase();
  return {
    organizations: database.collection<OrganizationRecord>("organizations"),
    agents: database.collection<RegisteredAgentRecord>("agents"),
    treasuries: database.collection<TreasuryRecord>("treasuries"),
    treasuryTransactions: database.collection<TreasuryTransactionRecord>(
      "treasuryTransactions",
    ),
    capabilities: database.collection<CapabilityRecord>("capabilities"),
  };
}
