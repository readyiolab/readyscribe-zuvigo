import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { prisma, PlanCode, WorkspaceRole, SubscriptionStatus } from "@zuvigo/db";
import { loadConfig } from "@zuvigo/config";
import { createLogger } from "@zuvigo/logger";
import { createEmailService } from "@zuvigo/email";

const log = createLogger({ name: "auth" });

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let i = 0;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${slugify(base)}-${i}`;
  }
  return slug;
}

export async function createDefaultWorkspaceForUser(user: {
  id: string;
  name?: string | null;
  email: string;
}) {
  const freePlan = await prisma.plan.findUnique({ where: { code: PlanCode.FREE } });
  if (!freePlan) {
    throw new Error("FREE plan missing — run db seed");
  }

  const name = user.name ? `${user.name}'s Workspace` : "My Workspace";
  const slug = await uniqueSlug(user.name || user.email.split("@")[0] || "workspace");

  return prisma.workspace.create({
    data: {
      name,
      slug,
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

export function createAuth() {
  const config = loadConfig();

  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (config.googleOAuthEnabled && config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
    };
  }

  const auth = betterAuth({
    appName: config.APP_NAME,
    baseURL: config.APP_URL,
    secret: config.AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "mysql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    socialProviders,
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          log.info({ email, url: "[redacted-path]" }, "Magic link generated");
          if (config.isDev) {
            log.info({ email, url }, "DEV magic link");
          }
          const emailService = createEmailService();
          await emailService.send({
            to: email,
            subject: `Sign in to ${config.APP_NAME}`,
            text: `Click the following link to sign in to ${config.APP_NAME}:\n\n${url}\n\nIf you didn't request this email, you can safely ignore it.`,
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
              <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Sign in to ${config.APP_NAME}</h2>
              <p style="margin-bottom: 24px; color: #4b5563; font-size: 15px;">Click the button below to sign in to your account. This link is valid for 10 minutes.</p>
              <p style="margin-bottom: 24px;">
                <a href="${url}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Sign In to ${config.APP_NAME}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="font-size: 13px; color: #9ca3af;">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${url}" style="color: #0284c7;">${url}</a></p>
            </div>`,
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await createDefaultWorkspaceForUser(user);
              log.info({ userId: user.id }, "Created default workspace for user");
            } catch (err) {
              log.error({ err, userId: user.id }, "Failed to create default workspace");
            }
          },
        },
      },
    },
    trustedOrigins: [config.APP_URL],
    advanced: {
      cookiePrefix: "zuvigo",
      useSecureCookies: config.isProd,
    },
  });

  return auth;
}

let authSingleton: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!authSingleton) {
    authSingleton = createAuth();
  }
  return authSingleton;
}

export async function getSessionFromHeaders(headers: Headers) {
  const auth = getAuth();
  return auth.api.getSession({ headers });
}
