//! Extract installed-app icons for the Apps dock (Win32 / macOS bundle — no shell).

#![allow(unsafe_code)]

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::ImageFormat;

use crate::user_apps;

fn icons_dir() -> PathBuf {
    user_apps::app_data_dir().join("icons")
}

fn cache_path_for(app_path: &Path) -> PathBuf {
    let key = app_path
        .to_string_lossy()
        .bytes()
        .fold(0u64, |acc, b| acc.wrapping_mul(131).wrapping_add(u64::from(b)));
    icons_dir().join(format!("{key:016x}.png"))
}

/// Cached PNG path for an app (.lnk / .exe / .app). Extracts on first request.
pub fn icon_cache_path(app_path: &Path) -> Result<PathBuf, String> {
    if app_path.as_os_str().is_empty() {
        return Err("empty path".into());
    }
    let cache = cache_path_for(app_path);
    if cache.is_file() {
        let meta = fs::metadata(&cache).map_err(|e| format!("read icon cache: {e}"))?;
        if meta.len() > 0 {
            return Ok(cache);
        }
    }

    let png = extract_png(app_path)?;
    fs::create_dir_all(icons_dir()).map_err(|e| format!("create icon dir: {e}"))?;
    let tmp = cache.with_extension("png.tmp");
    fs::write(&tmp, &png).map_err(|e| format!("write icon cache: {e}"))?;
    fs::rename(&tmp, &cache).map_err(|e| format!("commit icon cache: {e}"))?;
    Ok(cache)
}

fn extract_png(app_path: &Path) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        return windows::extract_png(app_path);
    }
    #[cfg(target_os = "macos")]
    {
        return macos::extract_png(app_path);
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = app_path;
        Err("icon extraction not supported on this OS".into())
    }
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::ffi::OsStr;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;

    const SHGFI_ICON: u32 = 0x0000_0100;
    const SHGFI_LARGEICON: u32 = 0x0000_0000;
    const BI_RGB: u32 = 0;
    const DIB_RGB_COLORS: u32 = 0;

    #[repr(C)]
    struct SHFILEINFOW {
        h_icon: isize,
        i_icon: i32,
        dw_attributes: u32,
        sz_display_name: [u16; 260],
        sz_type_name: [u16; 80],
    }

    #[repr(C)]
    struct ICONINFO {
        f_icon: i32,
        x_hotspot: u32,
        y_hotspot: u32,
        hbm_mask: isize,
        hbm_color: isize,
    }

    #[repr(C)]
    struct BITMAP {
        bm_type: i32,
        bm_width: i32,
        bm_height: i32,
        bm_width_bytes: i32,
        bm_planes: u16,
        bm_bits_pixel: u16,
        bm_bits: *mut std::ffi::c_void,
    }

    #[repr(C)]
    struct BITMAPINFOHEADER {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[repr(C)]
    struct BITMAPINFO {
        bmi_header: BITMAPINFOHEADER,
        bmi_colors: [u32; 1],
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetFileInfoW(
            psz_path: *const u16,
            dw_file_attributes: u32,
            psfi: *mut SHFILEINFOW,
            cb_file_info: u32,
            u_flags: u32,
        ) -> usize;
    }

    #[link(name = "user32")]
    extern "system" {
        fn DestroyIcon(h_icon: isize) -> i32;
        fn GetIconInfo(h_icon: isize, p_icon_info: *mut ICONINFO) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn GetObjectW(h: isize, c: i32, pv: *mut std::ffi::c_void) -> i32;
        fn GetDIBits(
            hdc: isize,
            hbm: isize,
            start: u32,
            c_lines: u32,
            lpv_bits: *mut std::ffi::c_void,
            lpbmi: *mut BITMAPINFO,
            usage: u32,
        ) -> i32;
        fn DeleteObject(h_object: isize) -> i32;
        fn CreateCompatibleDC(hdc: isize) -> isize;
        fn DeleteDC(hdc: isize) -> i32;
    }

    fn wide_path(path: &Path) -> Vec<u16> {
        OsStr::new(path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    pub fn extract_png(path: &Path) -> Result<Vec<u8>, String> {
        if !path.exists() {
            return Err("path not found".into());
        }
        let wide = wide_path(path);
        let mut info: SHFILEINFOW = unsafe { zeroed() };
        let ok = unsafe {
            SHGetFileInfoW(
                wide.as_ptr(),
                0,
                &mut info,
                size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            )
        };
        if ok == 0 || info.h_icon == 0 {
            return Err("SHGetFileInfoW failed".into());
        }
        let result = hicon_to_png(info.h_icon);
        unsafe {
            DestroyIcon(info.h_icon);
        }
        result
    }

    fn hicon_to_png(h_icon: isize) -> Result<Vec<u8>, String> {
        let mut icon_info: ICONINFO = unsafe { zeroed() };
        let ok = unsafe { GetIconInfo(h_icon, &mut icon_info) };
        if ok == 0 {
            return Err("GetIconInfo failed".into());
        }

        let mut bmp: BITMAP = unsafe { zeroed() };
        let got = unsafe {
            GetObjectW(
                icon_info.hbm_color,
                size_of::<BITMAP>() as i32,
                &mut bmp as *mut _ as *mut std::ffi::c_void,
            )
        };
        if got == 0 || bmp.bm_width <= 0 || bmp.bm_height <= 0 {
            cleanup_bitmap(&icon_info);
            return Err("GetObjectW failed".into());
        }

        let width = bmp.bm_width as u32;
        let height = bmp.bm_height as u32;
        let mut bmi: BITMAPINFO = unsafe { zeroed() };
        bmi.bmi_header.bi_size = size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmi_header.bi_width = bmp.bm_width;
        bmi.bmi_header.bi_height = -bmp.bm_height; // top-down
        bmi.bmi_header.bi_planes = 1;
        bmi.bmi_header.bi_bit_count = 32;
        bmi.bmi_header.bi_compression = BI_RGB;

        let mut pixels = vec![0u8; (width * height * 4) as usize];
        let hdc = unsafe { CreateCompatibleDC(0) };
        if hdc == 0 {
            cleanup_bitmap(&icon_info);
            return Err("CreateCompatibleDC failed".into());
        }
        let lines = unsafe {
            GetDIBits(
                hdc,
                icon_info.hbm_color,
                0,
                height,
                pixels.as_mut_ptr() as *mut _,
                &mut bmi,
                DIB_RGB_COLORS,
            )
        };
        unsafe {
            DeleteDC(hdc);
        }
        cleanup_bitmap(&icon_info);
        if lines == 0 {
            return Err("GetDIBits failed".into());
        }

        // BGRA → RGBA
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        let img =
            image::RgbaImage::from_raw(width, height, pixels).ok_or("invalid icon dimensions")?;
        let mut out = Vec::new();
        img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .map_err(|e| format!("encode png: {e}"))?;
        Ok(out)
    }

    fn cleanup_bitmap(info: &ICONINFO) {
        unsafe {
            if info.hbm_color != 0 {
                DeleteObject(info.hbm_color);
            }
            if info.hbm_mask != 0 {
                DeleteObject(info.hbm_mask);
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::io::BufReader;

    pub fn extract_png(path: &Path) -> Result<Vec<u8>, String> {
        let icns_path = find_icns(path).ok_or("no icns in app bundle")?;
        let file = fs::File::open(&icns_path).map_err(|e| format!("open icns: {e}"))?;
        let icon_family = icns::IconFamily::read(BufReader::new(file))
            .map_err(|e| format!("read icns: {e}"))?;
        let kind = icon_family
            .available_icons()
            .into_iter()
            .max_by_key(|k| k.pixel_width().saturating_mul(k.pixel_height()))
            .ok_or("empty icns")?;
        let img = icon_family
            .get_icon_with_type(kind)
            .map_err(|e| format!("decode icns: {e}"))?;
        let mut out = Vec::new();
        img.write_png(Cursor::new(&mut out))
            .map_err(|e| format!("encode png: {e}"))?;
        Ok(out)
    }

    fn find_icns(app_path: &Path) -> Option<PathBuf> {
        let resources = app_path.join("Contents/Resources");
        let preferred = resources.join("AppIcon.icns");
        if preferred.is_file() {
            return Some(preferred);
        }
        let entries = fs::read_dir(&resources).ok()?;
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("icns") {
                return Some(entry.path());
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_is_stable() {
        let a = cache_path_for(Path::new(r"C:\Apps\Foo.lnk"));
        let b = cache_path_for(Path::new(r"C:\Apps\Foo.lnk"));
        assert_eq!(a, b);
    }
}
