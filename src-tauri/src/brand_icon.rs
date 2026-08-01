//! Brand icon loaded from PNG bytes.
//!
//! MinGW fails to merge the Windows `.rsrc` section (`multiple non-default
//! manifests`), so the purple placeholder stays embedded in the PE. Load the
//! real artwork at runtime for the tray and window icon instead.

use tauri::image::Image;

/// High-res brand tile used for tray + window chrome.
pub fn brand_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/128x128.png"))
        .expect("src-tauri/icons/128x128.png must be a valid PNG")
}
