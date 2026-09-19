import type {
  CaptureSessionStatus,
  DocumentKind,
  DocumentStatus,
  ProcessingStage,
  WorkspaceRole,
} from "./enums.js";

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface DocumentListItemDto {
  id: string;
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  updatedAt: string;
  createdAt: string;
  createdByUserId: string;
  isSaved?: boolean;
  workspaceName?: string;
  workspaceId?: string;
}

export interface CaptureSessionDto {
  id: string;
  workspaceId: string;
  status: CaptureSessionStatus;
  documentId: string | null;
  progress?: {
    stage: ProcessingStage;
    message: string;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ScribeStepDto {
  id: string;
  position: number;
  title: string;
  description: string;
  callouts: unknown[];
  annotations: unknown[];
  assetId: string | null;
  assetUrl: string | null;
  /** Post-navigation / result screenshot (Scribe-style destination frame). */
  destinationAssetUrl: string | null;
}

export interface ScribeDto {
  id: string;
  documentId: string;
  title: string;
  summary: string | null;
  status: DocumentStatus;
  steps: ScribeStepDto[];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
