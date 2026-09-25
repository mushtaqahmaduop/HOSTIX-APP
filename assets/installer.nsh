; ─── HOSTYLLO OFFLINE — INSTALLER GUARD ─────────────────────────────────────
; Included by electron-builder (package.json build.nsis.include).
;
; WINDOWS 10 OR NEWER, BEFORE ANYTHING IS TOUCHED (owner, 2026-09-25).
; This build runs on Electron 43, and every Electron since 23 needs Windows 10.
; Without this the installer ran happily on Windows 7 / 8 / 8.1, installed over
; the hostel's working copy, and left an app that does not start. The data in
; %APPDATA%\hostix-app survived, but the hostel had no program until somebody
; put the old one back.
;
; customInit runs in .onInit, after electron-builder's own 64-bit check (which
; already refuses 32-bit Windows with its x64WinRequired message) and before any
; page is shown or file written. Quit here leaves the existing install exactly
; as it was. Those PCs are served by the separate Windows 7/8 build.
; ────────────────────────────────────────────────────────────────────────────

!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Hostyllo Offline ${VERSION} needs Windows 10 or Windows 11 (64-bit).$\r$\n$\r$\nThis computer runs an older version of Windows, so nothing has been installed and your current Hostyllo is unchanged.$\r$\n$\r$\nFor this computer, ask Hostyllo support for the Windows 7 / 8 edition:$\r$\nWhatsApp +92 342 8521842 or hostyllo.info@gmail.com" /SD IDOK
    Quit
  ${EndIf}
!macroend
