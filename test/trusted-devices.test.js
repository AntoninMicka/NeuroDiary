import assert from "node:assert/strict";
import test from "node:test";
import { ensureCurrentDeviceRegistration } from "../src/services/trustedDevices.js";

test("device registration recovers from an empty successful response", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map([["neurodiary-device-id-v1", "device-1234567890"]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options?.method ?? "GET" });
    if (options?.method === "PUT") {
      return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return Response.json({
      devices: [
        null,
        {
          deviceId: "device-1234567890",
          name: "Firefox",
          current: true,
          trustStatus: "trusted",
        },
      ],
    });
  };

  try {
    const registration = await ensureCurrentDeviceRegistration({ endpoint: "https://example.test" });
    assert.equal(registration.deviceId, "device-1234567890");
    assert.equal(registration.trustStatus, "trusted");
    assert.deepEqual(requests, [
      { url: "https://example.test/api/v1/devices/current", method: "PUT" },
      { url: "https://example.test/api/v1/devices", method: "GET" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});
