import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchEngine } from "@speakeasy-api/docs-mcp-core";

const { openSpy } = vi.hoisted(() => ({
  openSpy: vi.fn(),
}));

vi.mock("@speakeasy-api/docs-mcp-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@speakeasy-api/docs-mcp-core")>();
  return {
    ...actual,
    LanceDbSearchEngine: {
      open: openSpy,
    },
  };
});

import { createDocsServer } from "../create.js";

describe("createDocsServer query embedding provider resolution", () => {
  let indexDir: string;

  beforeEach(async () => {
    indexDir = await mkdtemp(path.join(os.tmpdir(), "docs-mcp-server-create-"));
    await mkdir(path.join(indexDir, ".lancedb"));
    await writeFile(
      path.join(indexDir, "metadata.json"),
      JSON.stringify({
        metadata_version: "1.1.0",
        corpus_description: "Test corpus",
        taxonomy: {},
        stats: {
          total_chunks: 1,
          total_files: 1,
          indexed_at: "2026-05-07T00:00:00Z",
        },
        embedding: {
          provider: "external",
          model: "qwen3-embedding-8b",
          dimensions: 4096,
        },
      }),
    );

    const fakeSearchEngine: SearchEngine = {
      search: vi.fn(),
      getDoc: vi.fn(),
      listFilepaths: vi.fn(),
    };
    openSpy.mockResolvedValue(fakeSearchEngine);
  });

  afterEach(async () => {
    await rm(indexDir, { recursive: true, force: true });
    openSpy.mockReset();
  });

  it("passes an external query embedding provider to LanceDB when metadata requests it", async () => {
    await createDocsServer(
      {
        indexDir,
        queryEmbeddingApiKey: "test-token",
        queryEmbeddingBaseUrl: "https://embeddings.example.com/v1",
      },
      {
        logLevel: "error",
      },
    );

    expect(openSpy).toHaveBeenCalledTimes(1);
    const openInput = openSpy.mock.calls[0]?.[0] as {
      queryEmbeddingProvider?: {
        name: string;
        model: string;
        dimensions: number;
      };
    };
    expect(openInput.queryEmbeddingProvider).toMatchObject({
      name: "external",
      model: "qwen3-embedding-8b",
      dimensions: 4096,
    });
  });
});
