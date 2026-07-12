import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Tank Warz garage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Tank Warz — Browser Tank Arena<\/title>/i);
  assert.match(html, /Tank Warz browser game/);
  assert.match(html, /Choose formation/);
  assert.match(html, /Choose your steel/);
  assert.match(html, />1v1</);
  assert.match(html, />2v2</);
  assert.match(html, />3v3</);
  assert.match(html, /Jackal/);
  assert.match(html, /Mammoth/);
  assert.match(html, /Longshot/);
  assert.match(html, />Deploy</);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the game canvas, controls, and original launch art", async () => {
  const [component, imageInfo] = await Promise.all([
    readFile(new URL("../app/components/TankWarzGame.tsx", import.meta.url), "utf8"),
    stat(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(component, /<canvas/);
  assert.match(component, /WASD/);
  assert.match(component, /Rocket Skid/);
  assert.match(component, /Bulwark Field/);
  assert.match(component, /Meteor Mortar/);
  assert.match(component, /MAP_W = 3200/);
  assert.ok(imageInfo.size > 100_000);
  await access(new URL("../public/favicon.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
