
// Setup full browser mocks before dynamic import of Agora
globalThis.window = globalThis;
globalThis.navigator = { userAgent: "Node.js Test Runner", mediaDevices: {} };
globalThis.document = {
  createElement: () => ({ setAttribute: () => {}, style: {} }),
  body: { appendChild: () => {} },
  getElementById: () => null
};
globalThis.location = { origin: "http://localhost:4173", href: "http://localhost:4173/" };
globalThis.CustomEvent = class CustomEvent {};

import("./mega-regression-telemetry-suite.mjs");
