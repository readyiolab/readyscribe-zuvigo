export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  EDITOR = "EDITOR",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER",
}

export enum DocumentKind {
  SCRIBE = "SCRIBE",
  PAGE = "PAGE",
}

export enum DocumentStatus {
  DRAFT = "DRAFT",
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
  ARCHIVED = "ARCHIVED",
}

export enum CaptureSessionStatus {
  STARTING = "STARTING",
  CAPTURING = "CAPTURING",
  PAUSED = "PAUSED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum CaptureClientType {
  BROWSER_EXTENSION = "BROWSER_EXTENSION",
  DESKTOP_APP = "DESKTOP_APP",
  MANUAL = "MANUAL",
  FUTURE_MOBILE = "FUTURE_MOBILE",
}

export enum CaptureEventType {
  CLICK = "CLICK",
  INPUT = "INPUT",
  SELECT = "SELECT",
  CHECKBOX = "CHECKBOX",
  RADIO = "RADIO",
  NAVIGATION = "NAVIGATION",
  TAB_CHANGE = "TAB_CHANGE",
  SCROLL = "SCROLL",
  SUBMIT = "SUBMIT",
  KEYBOARD = "KEYBOARD",
  PAGE_LOAD = "PAGE_LOAD",
  DOWNLOAD = "DOWNLOAD",
  UPLOAD = "UPLOAD",
  HOVER = "HOVER",
  CUSTOM = "CUSTOM",
}

export enum CaptureAssetKind {
  SCREENSHOT = "SCREENSHOT",
  THUMBNAIL = "THUMBNAIL",
  PROCESSED = "PROCESSED",
}

export enum CaptureAssetStatus {
  PENDING_UPLOAD = "PENDING_UPLOAD",
  UPLOADED = "UPLOADED",
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
}

export enum PageBlockType {
  TEXT = "TEXT",
  HEADING = "HEADING",
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
  SCRIBE = "SCRIBE",
  TABLE = "TABLE",
  CALLOUT = "CALLOUT",
  QUOTE = "QUOTE",
  CODE = "CODE",
  DIVIDER = "DIVIDER",
  LINK = "LINK",
}

export enum ShareVisibility {
  PRIVATE = "PRIVATE",
  WORKSPACE = "WORKSPACE",
  ANYONE_WITH_LINK = "ANYONE_WITH_LINK",
  PUBLIC = "PUBLIC",
}

export enum PlanCode {
  FREE = "FREE",
  PRO = "PRO",
  TEAM = "TEAM",
  BUSINESS = "BUSINESS",
  ENTERPRISE = "ENTERPRISE",
}

export enum ProcessingStage {
  ANALYZING = "ANALYZING",
  SCREENSHOTS = "SCREENSHOTS",
  WRITING = "WRITING",
  FINALIZING = "FINALIZING",
}

export type Permission =
  | "workspace.manage"
  | "workspace.invite"
  | "workspace.destroy"
  | "billing.manage"
  | "billing.transfer"
  | "document.create"
  | "document.read"
  | "document.edit"
  | "document.delete"
  | "document.share"
  | "capture.start"
  | "member.read"
  | "member.manage";

export type Entitlement =
  | "AI_PROCESSING"
  | "CAPTURE"
  | "EXPORT"
  | "ADVANCED_EDITING"
  | "DESKTOP_CAPTURE"
  | "CUSTOM_BRANDING";

export type UsageMetric =
  | "captures"
  | "storageBytes"
  | "aiRequests"
  | "aiTokens"
  | "exports"
  | "members";
