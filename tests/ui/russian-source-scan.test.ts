import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rendererDir = path.resolve("src/renderer");
const forbidden = [
  ">Settings<",
  ">Health<",
  ">Accounts<",
  ">Export<",
  ">Import<",
  ">Delete<",
  ">Refresh<",
  ">Switch<",
  ">Console<",
  ">Vault<",
  ">Limits<",
  ">Table<",
  ">Cards<",
  ">Device Login<",
  ">Auth Import<",
  ">Reauth Selected<",
  ">Profile Vault<",
  ">Device code<",
  "OAuth without browser coupling",
  "Attach existing `auth.json`",
  "No profile selected",
  "control surface",
  "selected profile",
  ">active<"
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("renderer source Russian UI", () => {
  it("does not contain common English user-facing labels", () => {
    const hits = files(rendererDir).flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return forbidden.filter((word) => text.includes(word)).map((word) => `${file}: ${word}`);
    });

    expect(hits).toEqual([]);
  });
});
