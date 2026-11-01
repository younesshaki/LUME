import test from "node:test";
import assert from "node:assert/strict";
import { ingressPolicy } from "../server/ingress-policy.ts";

test("ingress admits chat/visitor methods and public tenant headers", () => {
  for (const [path, method] of [
    ["/api/chat", "POST"],
    ["/api/chat", "OPTIONS"],
    ["/api/chat", "GET"],
    ["/api/visitor/me", "GET"],
    ["/api/visitor/login", "POST"],
    ["/api/visitor/logout", "POST"],
    ["/api/visitor/saved-vehicles/id", "DELETE"],
    ["/api/visitor/me", "OPTIONS"],
  ]) {
    const policy = ingressPolicy(path);
    assert.ok(policy.publicApi, path);
    assert.ok(policy.methods.includes(method), `${method} ${path}`);
  }
});
test("ingress keeps mutation methods limited to explicitly owned API families", () => {
  for (const [path, method] of [
    ["/products", "POST"],
    ["/api/arbitrary", "POST"],
    ["/api/chat", "DELETE"],
    ["/api/visitor/me", "PUT"],
    ["/api/vehicles", "DELETE"],
  ]) {
    assert.ok(
      !ingressPolicy(path).methods.includes(method),
      `${method} ${path}`,
    );
  }
});
test("lookalike API prefixes never gain public selector or mutation privileges", () => {
  for (const path of [
    "/api/chat-extra",
    "/api/visitorish/me",
    "/api/vehiclesish",
    "/api/leads-extra",
    "/contact",
  ]) {
    const policy = ingressPolicy(path);
    assert.equal(policy.publicApi, false, path);
    assert.deepEqual(policy.methods, ["GET", "HEAD"]);
  }
});
