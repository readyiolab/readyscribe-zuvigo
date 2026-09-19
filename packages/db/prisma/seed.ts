import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, PlanCode, WorkspaceRole, SubscriptionStatus } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../../.env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }

  if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) {
    const port = process.env.DB_PORT || "3306";
    const pass = process.env.DB_PASS ? `:${encodeURIComponent(process.env.DB_PASS)}` : "";
    const user = encodeURIComponent(process.env.DB_USER);
    const host = process.env.DB_HOST;
    const dbName = process.env.DB_NAME;
    process.env.DATABASE_URL = `mysql://${user}${pass}@${host}:${port}/${dbName}`;
  }
}

loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      code: PlanCode.FREE,
      name: "Free",
      entitlements: {
        AI_PROCESSING: true,
        CAPTURE: true,
        EXPORT: false,
        ADVANCED_EDITING: false,
        DESKTOP_CAPTURE: false,
        CUSTOM_BRANDING: false,
      },
      limits: {
        capturesPerMonth: 10,
        documents: 25,
        storageBytes: 500 * 1024 * 1024,
        aiRequestsPerMonth: 50,
        teamMembers: 1,
        exportsPerMonth: 0,
      },
    },
    {
      code: PlanCode.PRO,
      name: "Pro",
      entitlements: {
        AI_PROCESSING: true,
        CAPTURE: true,
        EXPORT: true,
        ADVANCED_EDITING: true,
        DESKTOP_CAPTURE: false,
        CUSTOM_BRANDING: false,
      },
      limits: {
        capturesPerMonth: 200,
        documents: 1000,
        storageBytes: 10 * 1024 * 1024 * 1024,
        aiRequestsPerMonth: 2000,
        teamMembers: 1,
        exportsPerMonth: 50,
      },
    },
    {
      code: PlanCode.TEAM,
      name: "Team",
      entitlements: {
        AI_PROCESSING: true,
        CAPTURE: true,
        EXPORT: true,
        ADVANCED_EDITING: true,
        DESKTOP_CAPTURE: false,
        CUSTOM_BRANDING: true,
      },
      limits: {
        capturesPerMonth: 1000,
        documents: 10000,
        storageBytes: 50 * 1024 * 1024 * 1024,
        aiRequestsPerMonth: 10000,
        teamMembers: 10,
        exportsPerMonth: 200,
      },
    },
    {
      code: PlanCode.BUSINESS,
      name: "Business",
      entitlements: {
        AI_PROCESSING: true,
        CAPTURE: true,
        EXPORT: true,
        ADVANCED_EDITING: true,
        DESKTOP_CAPTURE: true,
        CUSTOM_BRANDING: true,
      },
      limits: {
        capturesPerMonth: 5000,
        documents: 100000,
        storageBytes: 200 * 1024 * 1024 * 1024,
        aiRequestsPerMonth: 50000,
        teamMembers: 50,
        exportsPerMonth: 1000,
      },
    },
    {
      code: PlanCode.ENTERPRISE,
      name: "Enterprise",
      entitlements: {
        AI_PROCESSING: true,
        CAPTURE: true,
        EXPORT: true,
        ADVANCED_EDITING: true,
        DESKTOP_CAPTURE: true,
        CUSTOM_BRANDING: true,
      },
      limits: {
        capturesPerMonth: -1,
        documents: -1,
        storageBytes: -1,
        aiRequestsPerMonth: -1,
        teamMembers: -1,
        exportsPerMonth: -1,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {
        name: plan.name,
        entitlements: plan.entitlements,
        limits: plan.limits,
      },
    });
  }

  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { code: PlanCode.FREE } });

  const demoEmail = "demo@zuvigo.dev";
  let user = await prisma.user.findUnique({ where: { email: demoEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: demoEmail,
        name: "Demo User",
        emailVerified: true,
      },
    });
  }

  let workspace = await prisma.workspace.findUnique({ where: { slug: "demo" } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Demo Workspace",
        slug: "demo",
        ownerUserId: user.id,
        members: {
          create: {
            userId: user.id,
            role: WorkspaceRole.OWNER,
          },
        },
        subscription: {
          create: {
            planId: freePlan.id,
            status: SubscriptionStatus.ACTIVE,
          },
        },
      },
    });
  }

  console.log("Seed complete:", {
    userId: user.id,
    workspaceId: workspace.id,
    plans: plans.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
