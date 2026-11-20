use std::path::{Path, PathBuf};

use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
    CoTaskMemFree, CoUninitialize, IBindCtx,
};
use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
use windows::Win32::UI::Shell::{
    FOS_ALLOWMULTISELECT, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT,
    FileOpenDialog, FileSaveDialog, IFileDialog, IFileOpenDialog, IFileSaveDialog, IShellItem,
    SHCreateItemFromParsingName, SIGDN_FILESYSPATH,
};
use windows::core::{HSTRING, PCWSTR};

pub fn save(owner: Option<isize>, folder: Option<PathBuf>, name: &str) -> Option<PathBuf> {
    let extension = Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase);
    with_com(|| unsafe {
        let dialog: IFileSaveDialog =
            CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)?;
        if let Some(extension) = &extension {
            filter(
                &dialog,
                &extension.to_ascii_uppercase(),
                &format!("*.{extension}"),
            )?;
            dialog.SetDefaultExtension(&HSTRING::from(extension.as_str()))?;
        }
        dialog.SetFileName(&HSTRING::from(name))?;
        default_folder(&dialog, folder)?;
        dialog.SetOptions(dialog.GetOptions()? | FOS_OVERWRITEPROMPT | FOS_FORCEFILESYSTEM)?;
        dialog.Show(owner.map(|handle| HWND(handle as _)))?;
        path_of(&dialog.GetResult()?)
    })
    .ok()
}

pub fn open(owner: Option<isize>) -> Vec<PathBuf> {
    with_com(|| unsafe {
        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
        dialog.SetOptions(
            dialog.GetOptions()? | FOS_ALLOWMULTISELECT | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM,
        )?;
        dialog.Show(owner.map(|handle| HWND(handle as _)))?;
        let items = dialog.GetResults()?;
        let mut paths = Vec::new();
        for index in 0..items.GetCount()? {
            paths.push(path_of(&items.GetItemAt(index)?)?);
        }
        Ok(paths)
    })
    .unwrap_or_default()
}

fn with_com<T>(work: impl FnOnce() -> windows::core::Result<T>) -> windows::core::Result<T> {
    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = work();
        if initialized {
            CoUninitialize();
        }
        result
    }
}

unsafe fn filter(dialog: &IFileDialog, label: &str, pattern: &str) -> windows::core::Result<()> {
    let label = HSTRING::from(label);
    let pattern = HSTRING::from(pattern);
    unsafe {
        dialog.SetFileTypes(&[COMDLG_FILTERSPEC {
            pszName: PCWSTR(label.as_ptr()),
            pszSpec: PCWSTR(pattern.as_ptr()),
        }])
    }
}

unsafe fn default_folder(
    dialog: &IFileDialog,
    folder: Option<PathBuf>,
) -> windows::core::Result<()> {
    let Some(folder) = folder else {
        return Ok(());
    };
    let path = HSTRING::from(folder.to_string_lossy().as_ref());
    unsafe {
        if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&path, None::<&IBindCtx>)
        {
            dialog.SetDefaultFolder(&item)?;
        }
    }
    Ok(())
}

unsafe fn path_of(item: &IShellItem) -> windows::core::Result<PathBuf> {
    unsafe {
        let path = item.GetDisplayName(SIGDN_FILESYSPATH)?;
        let text = path.to_string();
        CoTaskMemFree(Some(path.0 as _));
        Ok(PathBuf::from(text?))
    }
}
