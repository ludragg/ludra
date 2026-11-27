!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    RmDir /r "$LOCALAPPDATA\${PRODUCTNAME}\data"
    RmDir "$LOCALAPPDATA\${PRODUCTNAME}"
    nsExec::Exec 'cmdkey /delete:app.ludra.desktop/session'
    Pop $0
  ${EndIf}
!macroend
