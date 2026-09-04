import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("utility menu panels are registered as visible panels", async () => {
  const source = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");
  const panelItems = source.match(/const PANEL_ITEMS = \[([\s\S]*?)\];/)?.[1] ?? "";
  const utilityTargets = [...source.matchAll(/handleUtilityAction\(\(\) => selectPanel\('(sekce-[^']+)'\)\)/g)]
    .map((match) => match[1]);

  for (const panelId of utilityTargets) {
    assert.match(panelItems, new RegExp(`id: ["']${panelId}["']`), `${panelId} is missing in PANEL_ITEMS`);
  }
});
