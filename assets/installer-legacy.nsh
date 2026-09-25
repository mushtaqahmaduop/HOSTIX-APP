; ─── HOSTYLLO OFFLINE — WINDOWS 7 / 8 EDITION INSTALLER NOTE ─────────────────
; Included by electron-builder on the legacy branch (build.nsis.include).
;
; This edition runs on Electron 22 so that Windows 7, 8 and 8.1 can run it;
; electron-builder already refuses XP and Vista. It installs on Windows 10/11
; too, but there it is the wrong choice: Electron 22 gets no security fixes
; and this edition updates only from the `legacy` channel. So on Windows 10 or
; newer the installer says so and lets the person choose — silent installs
; (the updater's /S) carry on, because an installed legacy copy updating
; itself is not a mistake worth interrupting.
; ────────────────────────────────────────────────────────────────────────────

!macro customInit
  ${If} ${AtLeastWin10}
    MessageBox MB_YESNO|MB_ICONINFORMATION|MB_DEFBUTTON2 "This is the Windows 7 / 8 edition of Hostyllo Offline ${VERSION}.$\r$\n$\r$\nThis computer runs Windows 10 or 11, which should use the standard edition instead — it is newer and gets security updates.$\r$\n$\r$\nInstall the Windows 7 / 8 edition anyway?" /SD IDYES IDYES +2
    Quit
  ${EndIf}
!macroend
