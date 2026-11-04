import { MongoClient, type Collection, type Db } from "mongodb";
import type { OrganizationRecord, RegisteredAgentRecord } from "@pact/shared";
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
    ]);
  }
  return db;
}

export async function collections(): Promise<{
  organizations: Collection<OrganizationRecord>;
  agents: Collection<RegisteredAgentRecord>;
}> {
  const database = await connectDatabase();
  return {
    organizations: database.collection<OrganizationRecord>("organizations"),
    agents: database.collection<RegisteredAgentRecord>("agents"),
  };
}
