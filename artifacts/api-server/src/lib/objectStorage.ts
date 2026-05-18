import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "recordings";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  async getObjectEntityUploadURL(): Promise<string> {
    // We don't use presigned URLs with Supabase — return a placeholder path
    // The actual upload path is what matters
    const objectId = randomUUID();
    return `/objects/uploads/${objectId}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // rawPath is already the object path we generated
    return rawPath;
  }

  async uploadObject(path: string, blob: Buffer, contentType: string): Promise<void> {
    const storagePath = path.replace(/^\/objects\//, "");
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }

  async downloadObject(path: string): Promise<Response> {
    const storagePath = path.replace(/^\/objects\//, "");
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(storagePath);
    if (error || !data) throw new ObjectNotFoundError();
    const arrayBuffer = await data.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: { "Content-Type": data.type || "audio/webm" },
    });
  }

  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    const storagePath = path.replace(/^\/objects\//, "");
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    if (error || !data) throw new ObjectNotFoundError();
    return data.signedUrl;
  }

  async getObjectEntityFile(objectPath: string): Promise<string> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    return objectPath;
  }

  async searchPublicObject(filePath: string): Promise<string | null> {
    return null;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: any): Promise<string> {
    return rawPath;
  }

  async canAccessObjectEntity({ userId, objectFile, requestedPermission }: any): Promise<boolean> {
    return true;
  }
}

export const objectStorageClient = null;
