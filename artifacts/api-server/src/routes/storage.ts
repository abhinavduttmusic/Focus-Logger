import { Router, type IRouter, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "recordings";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /storage/uploads/request-url
 * Now returns a direct upload path instead of a presigned URL.
 * The frontend will POST the file to /storage/uploads/:id instead.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  try {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${objectId}`;
    // Return a fake "uploadURL" that points to our own upload endpoint
    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`;
const uploadURL = `${baseUrl}/api/storage/uploads/${objectId}`;
    res.json({ uploadURL, objectPath });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/uploads/:id
 * Receives the audio file and uploads it to Supabase Storage.
 */
router.put("/storage/uploads/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const storagePath = `uploads/${id}`;
    const contentType = req.headers["content-type"] || "audio/webm";

    const buffer = req.body as Buffer;
    {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType, upsert: true });

      if (error) {
        console.error("Supabase upload error:", error);
        res.status(500).json({ error: "Upload failed" });
        return;
      }
      res.status(200).json({ success: true });
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * GET /storage/objects/*
 * Serves recordings from Supabase Storage via signed URL redirect.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const storagePath = wildcardPath;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (error || !data) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.redirect(data.signedUrl);
  } catch (error) {
    console.error("Error serving object:", error);
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * GET /storage/public-objects/*
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

export default router;
