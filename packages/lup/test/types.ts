import type { InspectedLup } from '@lunaris/lup';
declare const preview: InspectedLup;
const bytes: Uint8Array | undefined = preview.read('plugin.js');
// @ts-expect-error Preview paths are immutable.
preview.paths.push('new.js');
void bytes;
