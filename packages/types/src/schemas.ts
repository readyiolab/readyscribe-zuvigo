import { z } from "zod";
import { CaptureClientType, CaptureEventType } from "./enums.js";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

/** Optional string that accepts null from DOM getters and coerces to undefined. */
function optionalString(max?: number) {
  const base = max != null ? z.string().max(max) : z.string();
  return base.nullish().transform((v) => v ?? undefined);
}

export const createCaptureSchema = z.object({
  workspaceId: z.string().min(1),
  clientType: z.nativeEnum(CaptureClientType).default(CaptureClientType.BROWSER_EXTENSION),
  browser: z.string().max(100).optional(),
  browserVersion: z.string().max(50).optional(),
  // Chrome tabs can be chrome://, about:blank, etc. — accept any string, normalize later
  sourceUrl: z
    .string()
    .max(2048)
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return undefined;
      // Only persist http(s) page URLs; chrome:// / about:blank are ignored
      if (/^https?:\/\//i.test(v)) return v;
      return undefined;
    }),
  metadata: z.record(z.unknown()).optional(),
});

export const captureEventElementSchema = z.object({
  tag: optionalString(),
  text: optionalString(500),
  ariaLabel: optionalString(500),
  role: optionalString(),
  name: optionalString(),
  type: optionalString(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  selectorHint: optionalString(1000),
  isPassword: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
  valueRedacted: z.boolean().optional(),
});

export const captureEventSchema = z.object({
  clientEventId: z.string().min(1).max(100),
  sequence: z.number().int().nonnegative(),
  type: z.nativeEnum(CaptureEventType),
  timestamp: z.number().int().positive(),
  url: optionalString(2048),
  element: captureEventElementSchema.optional().nullable().transform((v) => v ?? undefined),
  metadata: z.record(z.unknown()).optional().nullable().transform((v) => v ?? undefined),
  assetClientId: optionalString(),
});

export const batchCaptureEventsSchema = z.object({
  events: z.array(captureEventSchema).min(1).max(100),
});

export const signAssetSchema = z.object({
  clientAssetId: z.string().min(1).max(100),
  mimeType: z.enum(["image/webp", "image/png", "image/jpeg"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  checksum: z.string().max(128).optional(),
});

export const registerAssetSchema = z.object({
  clientAssetId: z.string().min(1).max(100),
  assetId: z.string().min(1),
  checksum: z.string().max(128).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  byteSize: z.number().int().positive().optional(),
});

export const updateCaptureSchema = z.object({
  status: z.enum(["PAUSED", "CAPTURING", "CANCELLED"]),
});

export const updateScribeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(5000).optional(),
});

export const updateScribeStepSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  callouts: z.array(z.unknown()).optional(),
  annotations: z.array(z.unknown()).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const reorderStepsSchema = z.object({
  stepIds: z.array(z.string().min(1)).min(1),
});

export const createShareLinkSchema = z.object({
  documentId: z.string().min(1),
  visibility: z.enum(["PRIVATE", "WORKSPACE", "ANYONE_WITH_LINK", "PUBLIC"]),
  password: z.string().min(4).max(100).optional(),
  expiresAt: z.string().datetime().optional(),
  allowedEmails: z.array(z.string().email()).optional(),
});

export const createWorkspaceInviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["ADMIN", "EDITOR", "MEMBER", "VIEWER"]).default("EDITOR"),
});

export const rewriteScribeStepSchema = z.object({
  preset: z.enum(["clearer", "shorter", "formal"]).optional(),
  instruction: z.string().min(1).max(500).optional(),
}).refine((v) => Boolean(v.preset || v.instruction), {
  message: "preset or instruction is required",
});

export const exportScribeFormatSchema = z.object({
  format: z.enum(["markdown", "html", "pdf", "confluence"]),
});

export const updateWorkspaceBrandSchema = z.object({
  logoUrl: z.string().url().max(2048).nullable().optional(),
  clickColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  showBranding: z.boolean().optional(),
});

export const createPageSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200).default("Untitled page"),
});

export const updatePageBlockSchema = z.object({
  type: z.enum(["TEXT", "HEADING", "IMAGE", "SCRIBE", "DIVIDER"]).optional(),
  data: z.record(z.unknown()).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const addPageBlockSchema = z.object({
  type: z.enum(["TEXT", "HEADING", "IMAGE", "SCRIBE", "DIVIDER"]),
  data: z.record(z.unknown()).default({}),
  position: z.number().int().nonnegative().optional(),
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  stepId: z.string().min(1).optional().nullable(),
});

export const importScribeSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(200_000),
  polishWithAi: z.boolean().optional().default(true),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateCaptureInput = z.infer<typeof createCaptureSchema>;
export type CaptureEventInput = z.infer<typeof captureEventSchema>;
export type BatchCaptureEventsInput = z.infer<typeof batchCaptureEventsSchema>;
export type SignAssetInput = z.infer<typeof signAssetSchema>;
export type RegisterAssetInput = z.infer<typeof registerAssetSchema>;
export type UpdateCaptureInput = z.infer<typeof updateCaptureSchema>;
export type UpdateScribeInput = z.infer<typeof updateScribeSchema>;
export type UpdateScribeStepInput = z.infer<typeof updateScribeStepSchema>;
export type ReorderStepsInput = z.infer<typeof reorderStepsSchema>;
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
export type CreateWorkspaceInviteInput = z.infer<typeof createWorkspaceInviteSchema>;
export type RewriteScribeStepInput = z.infer<typeof rewriteScribeStepSchema>;
export type ExportScribeFormatInput = z.infer<typeof exportScribeFormatSchema>;
export type UpdateWorkspaceBrandInput = z.infer<typeof updateWorkspaceBrandSchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageBlockInput = z.infer<typeof updatePageBlockSchema>;
export type AddPageBlockInput = z.infer<typeof addPageBlockSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ImportScribeInput = z.infer<typeof importScribeSchema>;
