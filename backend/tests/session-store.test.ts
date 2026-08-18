import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FieldStatus } from "../src/domain/models.ts";
import { makeCompleteBrief } from "../src/llm/fake_client.ts";
import { FileSessionStore } from "../src/store.ts";

describe("session store", () => {
  it("test_file_session_store_survives_new_instance", () => {
    const directory = mkdtempSync(join(tmpdir(), "sessions-"));
    const storeA = new FileSessionStore(directory);
    const session = storeA.getOrCreate("persist-1");
    session.brief = makeCompleteBrief({ price: "40 zl" });
    session.brief.version = 4;
    session.awaiting_generation_confirmation = true;
    session.optional_fields_prompted.add("price");
    storeA.save(session);

    const storeB = new FileSessionStore(directory);
    const restored = storeB.get("persist-1");
    expect(restored).toBeDefined();
    expect(restored?.brief.version).toBe(4);
    expect(restored?.brief.price.value).toBe("40 zl");
    expect(restored?.brief.price.status).toBe(FieldStatus.CONFIRMED);
    expect(restored?.awaiting_generation_confirmation).toBe(true);
    expect(restored?.optional_fields_prompted.has("price")).toBe(true);
    expect(restored?.brief.product_name).toMatchObject({
      status: FieldStatus.CONFIRMED,
    });
  });
});
