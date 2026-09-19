import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppConfig } from "@zuvigo/config";
import { StorageError } from "@zuvigo/security";

export interface StorageService {
  upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(
    key: string,
    operation: "get" | "put",
    opts?: { expiresIn?: number; contentType?: string },
  ): Promise<string>;
  copy(sourceKey: string, destKey: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  readonly bucket: string;
}

const STORAGE_ROOT = "zuvigo";

function withRoot(...parts: string[]): string {
  return [STORAGE_ROOT, ...parts].join("/");
}

export function buildAssetObjectKey(
  workspaceId: string,
  captureSessionId: string,
  assetId: string,
  ext = "webp",
): string {
  return withRoot(
    "workspaces",
    workspaceId,
    "captures",
    captureSessionId,
    "assets",
    `${assetId}.${ext}`,
  );
}

export function buildThumbObjectKey(
  workspaceId: string,
  captureSessionId: string,
  assetId: string,
  ext = "webp",
): string {
  return withRoot(
    "workspaces",
    workspaceId,
    "captures",
    captureSessionId,
    "thumbs",
    `${assetId}.${ext}`,
  );
}

export function buildExportObjectKey(
  workspaceId: string,
  documentId: string,
  exportId: string,
  ext = "pdf",
): string {
  return withRoot(
    "workspaces",
    workspaceId,
    "documents",
    documentId,
    "exports",
    `${exportId}.${ext}`,
  );
}

export class SpacesStorageService implements StorageService {
  private client: S3Client;
  readonly bucket: string;

  constructor(config: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: false,
    });
  }

  async upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ACL: "private",
        }),
      );
    } catch (err) {
      throw new StorageError(`Upload failed: ${(err as Error).message}`);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new StorageError("Empty object body");
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(`Download failed: ${(err as Error).message}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      throw new StorageError(`Delete failed: ${(err as Error).message}`);
    }
  }

  async getSignedUrl(
    key: string,
    operation: "get" | "put",
    opts?: { expiresIn?: number; contentType?: string },
  ): Promise<string> {
    const expiresIn = opts?.expiresIn ?? 300;
    try {
      if (operation === "put") {
        const cmd = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: opts?.contentType,
          ACL: "private",
        });
        return getSignedUrl(this.client, cmd, { expiresIn });
      }
      const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return getSignedUrl(this.client, cmd, { expiresIn });
    } catch (err) {
      throw new StorageError(`Signed URL failed: ${(err as Error).message}`);
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${sourceKey}`,
          Key: destKey,
          ACL: "private",
        }),
      );
    } catch (err) {
      throw new StorageError(`Copy failed: ${(err as Error).message}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory storage for local/dev when Spaces credentials are absent. */
export class MemoryStorageService implements StorageService {
  readonly bucket = "memory";
  private store = new Map<string, { body: Buffer; contentType: string }>();

  async upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    this.store.set(key, { body: Buffer.from(body), contentType });
  }

  async download(key: string): Promise<Buffer> {
    const item = this.store.get(key);
    if (!item) throw new StorageError("Object not found");
    return item.body;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getSignedUrl(
    key: string,
    operation: "get" | "put",
    _opts?: { expiresIn?: number; contentType?: string },
  ): Promise<string> {
    return `memory://${operation}/${encodeURIComponent(key)}`;
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const item = this.store.get(sourceKey);
    if (!item) throw new StorageError("Source not found");
    this.store.set(destKey, { ...item, body: Buffer.from(item.body) });
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}

export function createStorageService(config: AppConfig): StorageService {
  if (
    config.storageEnabled &&
    config.SPACES_ENDPOINT &&
    config.SPACES_BUCKET &&
    config.SPACES_ACCESS_KEY &&
    config.SPACES_SECRET_KEY
  ) {
    return new SpacesStorageService({
      endpoint: config.SPACES_ENDPOINT,
      region: config.SPACES_REGION,
      bucket: config.SPACES_BUCKET,
      accessKey: config.SPACES_ACCESS_KEY,
      secretKey: config.SPACES_SECRET_KEY,
    });
  }
  return new MemoryStorageService();
}
