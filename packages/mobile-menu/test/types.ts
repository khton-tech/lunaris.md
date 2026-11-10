import type { MobileMenuItem } from '@lunaris/mobile-menu';
const item: MobileMenuItem = { id: 'test.action', label: 'Action', icon: 'sidebar', onPress() {} };
// @ts-expect-error Registrations are immutable snapshots.
item.label = 'Other';
// @ts-expect-error Actions require callbacks.
const invalid: MobileMenuItem = { id: 'test.invalid', label: 'Invalid', icon: 'sidebar' };
void invalid;
