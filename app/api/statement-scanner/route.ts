import { NextResponse } from "next/server";
import { getStatementScannerProvider } from "@/lib/statementScanner";
import type { ScannerAccountHint, ScannerImage } from "@/lib/statementScanner/provider";
import type { Category } from "@/types/category";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set<ScannerImage["mediaType"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function parseMetadata<T>(formData: FormData, key: string): T {
  const value = formData.get(key);
  if (typeof value !== "string") throw new Error(`Missing ${key} metadata.`);
  return JSON.parse(value) as T;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("images").filter((value): value is File => value instanceof File);
    if (files.length < 1 || files.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Select between 1 and ${MAX_IMAGES} images.` }, { status: 400 });
    }

    const images: ScannerImage[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type as ScannerImage["mediaType"])) {
        return NextResponse.json({ error: `Unsupported image type: ${file.type || "unknown"}.` }, { status: 400 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: `${file.name} exceeds the 8 MB image limit.` }, { status: 400 });
      }
      images.push({
        mediaType: file.type as ScannerImage["mediaType"],
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      });
    }

    const categories = parseMetadata<Pick<Category, "id" | "name" | "type">[]>(formData, "categories")
      .slice(0, 250)
      .map((category) => ({ id: String(category.id), name: String(category.name), type: category.type }));
    const accounts = parseMetadata<ScannerAccountHint[]>(formData, "accounts")
      .slice(0, 100)
      .map((account) => ({
        id: String(account.id),
        name: String(account.name),
        kind: account.kind === "card" ? "card" as const : "account" as const,
        last4: account.last4 ? String(account.last4).slice(-4) : undefined,
      }));

    const result = await getStatementScannerProvider().extract({ images, categories, accounts });
    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Statement extraction failed.";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
