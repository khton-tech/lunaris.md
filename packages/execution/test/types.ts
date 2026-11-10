import type { ExecutionValue, ExecutionRealm } from '@lunaris/execution';
const data: ExecutionValue = { value: [1, 'two', null] };
// @ts-expect-error Host callbacks cannot pass as ordinary guest data.
const unsafe: ExecutionValue = { run() {} };
declare const realm: ExecutionRealm;
const result: ExecutionValue = realm.call('read', [data]);
void result; void unsafe;
