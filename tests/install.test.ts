import { afterEach, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { pkcs1ToPkcs8 } from "../worker/github";
import { NotInstalledError, resolveRepo } from "../worker/instance";
import type { Env, Instance } from "../worker/env";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("an App missing from the tidy repository is reported as such, with what to install where", async () => {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const instance = {
    app: { id: 1, slug: "peepo-review", privateKey: pkcs1ToPkcs8(pem) },
    repo: { fullName: "enhancer-app/tidy" },
    keys: {},
  } as unknown as Instance;
  globalThis.fetch = (async () => new Response('{"message":"Not Found"}', { status: 404 })) as unknown as typeof fetch;
  const error = await resolveRepo({} as Env, instance).catch((e) => e);
  expect(error).toBeInstanceOf(NotInstalledError);
  expect(error).toMatchObject({ repo: "enhancer-app/tidy", slug: "peepo-review" });
});
