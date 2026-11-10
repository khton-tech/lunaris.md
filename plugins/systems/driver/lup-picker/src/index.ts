import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { LimePackagePicker } from "@lunaris/lime";
import type { LimeResult } from "@lunaris/lime";
import { LUP_LIMITS } from "@lunaris/lup";

/** Browser/WebView file selection grants access to one File, never its parent path. */
export function createLupPicker(document: Document = globalThis.document) {
  return definePlugin({ manifest: { manifestVersion: 1, id: 'lunaris.lup-picker', version: '0.1.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './dist/index.js',
    provides: [{ kind: 'api', id: LimePackagePicker.id, version: LimePackagePicker.version }], requires: [{ kind: 'api', id: Logger.id, range: '^1.0.0' }], permissions: [], optionalPermissions: [],
  }, activate(ctx) {
    const logger = ctx.use(Logger); let busy = false;
    ctx.provide(LimePackagePicker, { pick(owner) {
      if (busy) return Promise.resolve({ ok: false, error: { code: 'BUSY', message: 'A package picker is already open.' } });
      if (owner.aborted || ctx.signal.aborted) return Promise.resolve({ ok: true, value: null });
      busy = true;
      return new Promise<LimeResult<Uint8Array | null>>(resolve => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.lup'; input.multiple = false; input.hidden = true;
        let settled = false; let reading = false;
        const finish = (result: LimeResult<Uint8Array | null>) => {
          if (settled) return; settled = true; busy = false;
          owner.removeEventListener('abort', cancel); ctx.signal.removeEventListener('abort', cancel);
          input.removeEventListener('change', selected); input.removeEventListener('cancel', cancel); input.remove(); resolve(result);
        };
        const cancel = () => finish({ ok: true, value: null });
        const selected = async () => {
          if (reading || settled) return; reading = true;
          const file = input.files?.[0];
          if (!file) { cancel(); return; }
          if (file.size > LUP_LIMITS.archiveBytes || !file.name.toLowerCase().endsWith('.lup')) {
            logger.warn(ctx.pluginId, 'Selected package rejected', { code: 'PACKAGE_SELECTION_INVALID', data: { bytes: file.size } });
            finish({ ok: false, error: { code: 'INVALID_PACKAGE', message: 'Select a .lup file within the package size limit.' } }); return;
          }
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (settled || owner.aborted || ctx.signal.aborted) { cancel(); return; }
            if (bytes.length > LUP_LIMITS.archiveBytes) throw new Error('Selected bytes exceed the package limit.');
            logger.info(ctx.pluginId, 'Selected package bytes ready', { data: { bytes: bytes.length } });
            finish({ ok: true, value: bytes });
          } catch (error) {
            if (settled || ctx.signal.aborted) { cancel(); return; }
            logger.error(ctx.pluginId, 'Cannot read selected package', { error });
            finish({ ok: false, error: { code: 'INVALID_PACKAGE', message: 'Cannot read the selected package.' } });
          }
        };
        owner.addEventListener('abort', cancel, { once: true }); ctx.signal.addEventListener('abort', cancel, { once: true });
        input.addEventListener('change', selected); input.addEventListener('cancel', cancel, { once: true });
        try { document.body.append(input); input.click(); }
        catch (error) { logger.error(ctx.pluginId, 'Package picker unavailable', { error }); finish({ ok: false, error: { code: 'UNSUPPORTED', message: 'Package selection is unavailable on this host.' } }); }
      });
    } });
    logger.info(ctx.pluginId, 'LUP picker driver ready');
  } });
}
