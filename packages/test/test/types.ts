import { createTestKernel } from "@lunaris/test";
import { defineApi } from "@lunaris/sdk";
const kernel = createTestKernel();
const token = defineApi<{ read(): number }>({ id: "test.value", version: "1.0.0" });
kernel.installMock(token, { read: () => 42 });
// @ts-expect-error Mock implementations retain contract types.
kernel.installMock(token, { read: () => "wrong" });
// @ts-expect-error Package internals remain inaccessible.
import "@lunaris/test/src/index.js";
