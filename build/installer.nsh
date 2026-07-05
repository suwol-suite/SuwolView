!macro RegisterSuwolViewApplication EXT PROGID
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe\SupportedTypes" ".${EXT}" ""
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe\Capabilities\FileAssociations" ".${EXT}" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\RegisteredApplications" "SuwolView" "Software\Classes\Applications\SuwolView.exe\Capabilities"
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe" "FriendlyAppName" "SuwolView"
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe\DefaultIcon" "" "$INSTDIR\resources\icon.ico"
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe\shell\open\command" "" "$INSTDIR\SuwolView.exe $\"%1$\""
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe\Capabilities" "ApplicationName" "SuwolView"
  WriteRegStr HKCU "Software\Classes\Applications\SuwolView.exe\Capabilities" "ApplicationDescription" "Free open-source image, comic, webtoon, and metadata viewer."

  !insertmacro RegisterSuwolViewApplication "jpg" "JPEG Image"
  !insertmacro RegisterSuwolViewApplication "jpeg" "JPEG Image"
  !insertmacro RegisterSuwolViewApplication "png" "PNG Image"
  !insertmacro RegisterSuwolViewApplication "gif" "GIF Image"
  !insertmacro RegisterSuwolViewApplication "webp" "WebP Image"
  !insertmacro RegisterSuwolViewApplication "avif" "AVIF Image"
  !insertmacro RegisterSuwolViewApplication "bmp" "BMP Image"
  !insertmacro RegisterSuwolViewApplication "ico" "Icon Image"
  !insertmacro RegisterSuwolViewApplication "svg" "SVG Image"
  !insertmacro RegisterSuwolViewApplication "tif" "TIFF Image"
  !insertmacro RegisterSuwolViewApplication "tiff" "TIFF Image"
  !insertmacro RegisterSuwolViewApplication "zip" "ZIP Image Archive"
  !insertmacro RegisterSuwolViewApplication "cbz" "CBZ Comic Archive"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "SuwolView"
  DeleteRegKey HKCU "Software\Classes\Applications\SuwolView.exe"
  DeleteRegValue HKCU "Software\Classes\.jpg\OpenWithProgids" "JPEG Image"
  DeleteRegValue HKCU "Software\Classes\.jpeg\OpenWithProgids" "JPEG Image"
  DeleteRegValue HKCU "Software\Classes\.png\OpenWithProgids" "PNG Image"
  DeleteRegValue HKCU "Software\Classes\.gif\OpenWithProgids" "GIF Image"
  DeleteRegValue HKCU "Software\Classes\.webp\OpenWithProgids" "WebP Image"
  DeleteRegValue HKCU "Software\Classes\.avif\OpenWithProgids" "AVIF Image"
  DeleteRegValue HKCU "Software\Classes\.bmp\OpenWithProgids" "BMP Image"
  DeleteRegValue HKCU "Software\Classes\.ico\OpenWithProgids" "Icon Image"
  DeleteRegValue HKCU "Software\Classes\.svg\OpenWithProgids" "SVG Image"
  DeleteRegValue HKCU "Software\Classes\.tif\OpenWithProgids" "TIFF Image"
  DeleteRegValue HKCU "Software\Classes\.tiff\OpenWithProgids" "TIFF Image"
  DeleteRegValue HKCU "Software\Classes\.zip\OpenWithProgids" "ZIP Image Archive"
  DeleteRegValue HKCU "Software\Classes\.cbz\OpenWithProgids" "CBZ Comic Archive"
!macroend
