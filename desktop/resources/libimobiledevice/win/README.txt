Drop Windows libimobiledevice binaries here for bundled desktop usage.

Required binaries for rich metadata in iReader:
- idevice_id.exe
- ideviceinfo.exe
- idevicediagnostics.exe

Recommended supporting DLLs (same folder):
- libimobiledevice-1.0.dll
- libusbmuxd-2.0.dll
- libplist-2.0.dll
- libssl*.dll / libcrypto*.dll (if required by your build)

Notes:
- During development, the app checks this path first.
- In packaged builds, electron-builder copies resources/libimobiledevice to app resources/libimobiledevice.
- If binaries are not present, app falls back to PATH lookup.
