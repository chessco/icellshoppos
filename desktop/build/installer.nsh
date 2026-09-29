; Runs once, silently, during iReader setup: installs "Apple Devices" (Apple
; Mobile Device Support) from the Microsoft Store via winget, so Windows
; recognizes an iPhone/iPad over USB the first time it's plugged in — no
; manual step needed after installing iReader.
;
; Best-effort only: if winget is missing, offline, or the install fails, we
; swallow the error and let setup continue. The in-app "Instalar drivers de
; Apple" button (Add Device screen) remains as a fallback for that case.

!macro customInstall
  DetailPrint "Installing Apple Mobile Device Support (Apple Devices)..."
  nsExec::ExecToLog 'winget install --id Apple.AppleDevices -e --source msstore --accept-package-agreements --accept-source-agreements --silent'
  Pop $0
!macroend
