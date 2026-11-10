import { runAuditRegressions } from './audit-regressions.mjs';
runAuditRegressions('Deep audit remediation', [
  'plugins/UI/text-editor/test/session.test.mjs', 'plugins/systems/driver/server-transport/test/transport.test.mjs',
  'plugins/systems/filesystem/test/provider.test.mjs', 'packages/kernel/test/root-disposal.test.mjs',
], 'clean flush settles|overlapping connection|superseded during status|failed watch release|indirect async recursive');
