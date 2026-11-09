import {Clipboard,ClipboardDriver} from '@lunaris/clipboard';
import type {ClipboardApi,ClipboardResult} from '@lunaris/clipboard';
declare const api:ClipboardApi;
const result:Promise<ClipboardResult<string>>=api.readText();
// @ts-expect-error Only text is accepted by the public contract.
api.writeText(42);
void result;void Clipboard;void ClipboardDriver;
