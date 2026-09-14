# iCellShop Desktop (Phase 1)

Electron-based desktop client scaffold for Windows and macOS.

## Goals implemented in this phase

- Native desktop shell baseline (custom title bar on Windows/Linux, app menu, native dialogs, native context menu, notifications)
- Secure desktop session bootstrap against existing backend APIs
- No changes to existing web app behavior

## Project structure

- `src/main/` Electron main process
- `src/preload/` IPC bridge (safe renderer access)
- `src/renderer/` React UI

## Commands

```bash
npm install
npm run dev
npm run build
npm run dist:win
npm run dist:mac
npm run release:win-zip
npm run publish:s3
```

`npm run release:win-zip` builds the desktop app, packages `dist/win-unpacked`, and creates `dist/win-unpacked-latest.zip` for upload.

`npm run publish:s3` uploads the newest Windows installer `.exe`, its `.blockmap`, `latest.yml`, and `dist/win-unpacked-latest.zip` when present. Set `AWS_S3_BUCKET` or `S3_BUCKET`, and optionally `AWS_S3_PREFIX` or `S3_PREFIX` plus `AWS_REGION`.

## Current implemented backend integration

- `POST /api/auth/login`
- `GET /api/auth/me`

Session cookie is currently persisted locally in the desktop app data path and reused for API calls from main process.

## Next steps

1. Replace cookie persistence with OS credential manager integration
2. Implement Apple USB adapter and real-time device attach/detach events
3. Implement duplicate checks and one-click `POST /api/inventory`
4. Add native-feel acceptance checks on both platforms

## Bundled libimobiledevice (Phase 2 bootstrap)

The desktop app now looks for libimobiledevice binaries in this order:

1. `LIBIMOBILEDEVICE_DIR` environment variable
2. Packaged resources path: `resources/libimobiledevice/win`
3. Workspace resources path: `desktop/resources/libimobiledevice/win`
4. System PATH fallback

Place the Windows binaries in:

- `desktop/resources/libimobiledevice/win/`

At minimum for rich USB metadata:

- `idevice_id.exe`
- `ideviceinfo.exe`
- `idevicediagnostics.exe`

The `electron-builder` config includes `resources/libimobiledevice/**` as `extraResources`, so packaged builds carry these binaries automatically.
