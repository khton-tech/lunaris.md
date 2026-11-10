import { runAuditRegressions } from './audit-regressions.mjs';
runAuditRegressions('System audit remediation', [
  'hosts/tauri/test/session.test.mjs', 'tools/scripts/preferences-retirement.test.mjs',
  'plugins/systems/driver/browser-storage/test/storage.test.mjs', 'plugins/UI/text-editor/test/session.test.mjs',
  'plugins/UI/mantine-components/test/components.test.mjs', 'plugins/systems/driver/server-transport/test/transport.test.mjs',
  'plugins/systems/config/test/manager.test.mjs', 'packages/remote/test/contracts.test.mjs',
], 'caught runtime|broken optional|fatal recovery|pending preferences|independent writers|schema upgrade|discard|acknowledgement cleanup|Workspace leaves|provider selections|replace a bundled|JSON and plain 503|remote content limits|oversized file content|restore names|persists the display name|invalid stored display names');
