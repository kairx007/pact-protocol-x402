import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import express, {
  type Express,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { DomainError } from "@pact/shared";
import {
  authContext,
  requireOrganizationAccess,
  requireOwner,
  requestId,
  requireSession,
} from "./auth.js";
import {
  confirmTreasuryCreation,
  confirmTreasuryTransaction,
} from "./treasury-services.js";
import { config } from "./config.js";
import {
  createOrganization,
  getAgent,
  getOrganization,
  linkOrganizationWallet,
  listAgents,
  registerAgent,
  revokeAgent,
  rotateAgentSigner,
  verifyAgentIdentity,
} from "./services.js";
import {
  createTreasury,
  depositIntent,
  getTreasury,
  pauseTreasury,
  treasuryBalance,
  treasuryTransactionsPage,
  unpauseTreasury,
  withdrawTreasury,
} from "./treasury-services.js";

export const app: Express = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  const id = req.header("x-request-id")?.slice(0, 128) || randomUUID();
  res.locals.requestId = id;
  res.setHeader("x-request-id", id);
  next();
});

if (config.NODE_ENV !== "production") {
  app.post("/__test/session", (req, res) => {
    const userId = typeof req.body.userId === "string" ? req.body.userId : "";
    const organizationId =
      typeof req.body.organizationId === "string"
        ? req.body.organizationId
        : undefined;
    const role = req.body.role;
    const exp = Math.floor(Date.now() / 1000) + 300;
    if (!userId || !["owner", "admin", "agent"].includes(role)) {
      res.status(400).json({ error: "Invalid test identity" });
      return;
    }
    const token = Buffer.from(
      JSON.stringify({ userId, organizationId, role, exp }),
    ).toString("base64url");
    const signature = createHmac("sha256", config.AUTH_HMAC_SECRET)
      .update(token)
      .digest("hex");
    res.json({ token: `${token}.${signature}` });
  });
}

function success<T>(
  req: Request,
  res: Response,
  data: T,
  message: string,
  status = 200,
): void {
  res.status(status).json({
    success: true,
    message,
    data,
    meta: { requestId: requestId(req) },
  });
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/v1/organizations", requireSession, async (req, res, next) => {
  try {
    const organization = await createOrganization(authContext(res), req.body);
    return success(req, res, organization, "Organization created", 201);
  } catch (error) {
    return next(error);
  }
});

app.get(
  "/v1/organizations/:orgId",
  requireSession,
  requireOrganizationAccess,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await getOrganization(authContext(res), String(req.params.orgId)),
        "Organization retrieved",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries/:treasuryId/confirm-creation",
  requireSession,
  requireOwner,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await confirmTreasuryCreation(
          authContext(res),
          String(req.params.treasuryId),
          req.body,
        ),
        "Treasury deployment confirmed",
        201,
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/organizations/:orgId/wallet",
  requireSession,
  requireOwner,
  requireOrganizationAccess,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await linkOrganizationWallet(
          authContext(res),
          String(req.params.orgId),
          req.body,
        ),
        "Organization wallet verified and linked",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries",
  requireSession,
  requireOwner,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await createTreasury(authContext(res), req.body),
        "Treasury created",
        201,
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.get(
  "/v1/treasuries/:treasuryId",
  requireSession,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await getTreasury(authContext(res), String(req.params.treasuryId)),
        "Treasury retrieved",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries/:treasuryId/deposit-intent",
  requireSession,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await depositIntent(
          authContext(res),
          String(req.params.treasuryId),
          req.body,
        ),
        "Deposit transaction prepared",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries/:treasuryId/withdraw",
  requireSession,
  requireOwner,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await withdrawTreasury(
          authContext(res),
          String(req.params.treasuryId),
          req.body,
        ),
        "Withdrawal confirmed",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.get(
  "/v1/treasuries/:treasuryId/balance",
  requireSession,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await treasuryBalance(authContext(res), String(req.params.treasuryId)),
        "Treasury balance retrieved",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.get(
  "/v1/treasuries/:treasuryId/transactions",
  requireSession,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await treasuryTransactionsPage(
          authContext(res),
          String(req.params.treasuryId),
        ),
        "Treasury transactions retrieved",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries/:treasuryId/confirm-transaction",
  requireSession,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await confirmTreasuryTransaction(
          authContext(res),
          String(req.params.treasuryId),
          req.body,
        ),
        "Treasury transaction confirmed and indexed",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries/:treasuryId/pause",
  requireSession,
  requireOwner,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await pauseTreasury(authContext(res), String(req.params.treasuryId)),
        "Treasury paused",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/treasuries/:treasuryId/unpause",
  requireSession,
  requireOwner,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await unpauseTreasury(authContext(res), String(req.params.treasuryId)),
        "Treasury unpaused",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/agents/register",
  requireSession,
  requireOwner,
  requireOrganizationAccess,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await registerAgent(authContext(res), req.body),
        "Agent registered and identity verified",
        201,
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.get("/v1/agents", requireSession, async (req, res, next) => {
  try {
    return success(
      req,
      res,
      await listAgents(
        authContext(res),
        req.query.organizationId as string | undefined,
      ),
      "Agents retrieved",
    );
  } catch (error) {
    return next(error);
  }
});

app.get("/v1/agents/:agentId", requireSession, async (req, res, next) => {
  try {
    return success(
      req,
      res,
      await getAgent(authContext(res), String(req.params.agentId)),
      "Agent retrieved",
    );
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/v1/agents/:agentId/verify-identity",
  requireSession,
  requireOwner,
  requireOrganizationAccess,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await verifyAgentIdentity(
          authContext(res),
          String(req.params.agentId),
          req.body.organizationId,
        ),
        "Agent identity re-verified",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/agents/:agentId/revoke",
  requireSession,
  requireOwner,
  requireOrganizationAccess,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await revokeAgent(
          authContext(res),
          String(req.params.agentId),
          req.body.organizationId,
        ),
        "Agent access revoked",
      );
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/v1/agents/:agentId/rotate-key",
  requireSession,
  requireOwner,
  requireOrganizationAccess,
  async (req, res, next) => {
    try {
      return success(
        req,
        res,
        await rotateAgentSigner(
          authContext(res),
          String(req.params.agentId),
          req.body,
        ),
        "Agent signer rotated",
      );
    } catch (error) {
      return next(error);
    }
  },
);

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  void next;
  const domainError = error instanceof DomainError ? error : undefined;
  const statusCode =
    domainError?.statusCode ??
    (error && typeof error === "object" && "statusCode" in error
      ? Number(error.statusCode)
      : 500);
  const code =
    domainError?.code ??
    (error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "INTERNAL_ERROR");
  const message =
    domainError?.message ??
    (statusCode < 500 && error instanceof Error
      ? error.message
      : "Internal server error");
  if (statusCode >= 500)
    console.error(
      JSON.stringify({
        level: "error",
        requestId: requestId(req),
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  res.status(statusCode).json({
    success: false,
    message,
    error: { code, details: domainError?.details ?? {} },
    meta: { requestId: requestId(req) },
  });
};
app.use(errorHandler);

export function listen(): void {
  app.listen(config.PORT, () =>
    console.log(
      JSON.stringify({
        level: "info",
        message: "PACT API listening",
        port: config.PORT,
      }),
    ),
  );
}
