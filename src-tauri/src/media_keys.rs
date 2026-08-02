//! Cross-platform multimedia key injection for the action broker.
//!
//! Windows: `user32::keybd_event` with VK_MEDIA_*.
//! macOS: IOKit `IOHIDPostEvent` with NX aux media key codes (no shell, no new crates).

#![allow(unsafe_code)] // Platform FFI for media keys only.

#[derive(Clone, Copy)]
pub enum MediaKind {
    PlayPause,
    Next,
    Prev,
}

pub fn execute_media_key(kind: MediaKind, spoken: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        windows::tap(kind)?;
        return Ok(spoken.to_string());
    }
    #[cfg(target_os = "macos")]
    {
        macos::tap(kind)?;
        return Ok(spoken.to_string());
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = kind;
        Err(format!(
            "Media keys are not supported on {}",
            std::env::consts::OS
        ))
    }
}

#[cfg(windows)]
mod windows {
    use super::MediaKind;

    const VK_MEDIA_NEXT_TRACK: u8 = 0xB0;
    const VK_MEDIA_PREV_TRACK: u8 = 0xB1;
    const VK_MEDIA_PLAY_PAUSE: u8 = 0xB3;
    const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;
    const KEYEVENTF_KEYUP: u32 = 0x0002;

    #[link(name = "user32")]
    extern "system" {
        fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
    }

    pub fn tap(kind: MediaKind) -> Result<(), String> {
        let vk = match kind {
            MediaKind::PlayPause => VK_MEDIA_PLAY_PAUSE,
            MediaKind::Next => VK_MEDIA_NEXT_TRACK,
            MediaKind::Prev => VK_MEDIA_PREV_TRACK,
        };
        // SAFETY: keybd_event is the documented Win32 multimedia-key path; vk is
        // one of three hard-coded constants above.
        unsafe {
            keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, 0);
            keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::MediaKind;
    use std::ffi::CString;
    use std::mem::MaybeUninit;
    use std::os::raw::{c_char, c_void};
    use std::sync::OnceLock;

    // IOKit / NX constants (ev_keymap.h / IOLLEvent.h / IOHIDShared.h)
    const NX_KEYTYPE_PLAY: u8 = 16;
    const NX_KEYTYPE_NEXT: u8 = 17;
    const NX_KEYTYPE_PREVIOUS: u8 = 18;
    const NX_SUBTYPE_AUX_CONTROL_BUTTONS: u8 = 8;
    const NX_KEYDOWN: i32 = 0x0A;
    const NX_KEYUP: i32 = 0x0B;
    const NX_SYSDEFINED: u32 = 14;
    const K_NX_EVENT_DATA_VERSION: u32 = 1;
    const K_IO_HID_PARAM_CONNECT_TYPE: u32 = 1;

    type KernReturn = i32;
    type IoObject = u32;
    type IoConnect = u32;
    type IoIterator = u32;
    type MachPort = u32;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct IOGPoint {
        x: i16,
        y: i16,
    }

    /// Layout matching the `compound` arm of `NXEventData` for aux keys.
    #[repr(C)]
    struct NXEventData {
        reserved: u8,
        sub_type: u8,
        _pad: [u8; 2],
        misc_l: [i32; 2],
        _rest: [u8; 24],
    }

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOServiceMatching(name: *const c_char) -> *mut c_void;
        fn IOServiceGetMatchingServices(
            main_port: MachPort,
            matching: *mut c_void,
            existing: *mut IoIterator,
        ) -> KernReturn;
        fn IOIteratorNext(iterator: IoIterator) -> IoObject;
        fn IOObjectRelease(object: IoObject) -> KernReturn;
        fn IOServiceOpen(
            service: IoObject,
            owning_task: MachPort,
            type_: u32,
            connect: *mut IoConnect,
        ) -> KernReturn;
        fn IOHIDPostEvent(
            connect: IoConnect,
            event_type: u32,
            location: IOGPoint,
            event_data: *const NXEventData,
            event_data_version: u32,
            event_flags: u32,
            options: u32,
        ) -> KernReturn;
        // mach_task_self() is a macro over this exported port.
        static mut mach_task_self_: MachPort;
    }

    // kIOMainPortDefault is 0 on modern SDKs.
    const K_IO_MAIN_PORT_DEFAULT: MachPort = 0;

    unsafe fn mach_task_self() -> MachPort {
        mach_task_self_
    }

    static DRIVER: OnceLock<Result<IoConnect, String>> = OnceLock::new();

    fn event_driver() -> Result<IoConnect, String> {
        DRIVER.get_or_init(|| unsafe { open_hid_system() }).clone()
    }

    unsafe fn open_hid_system() -> Result<IoConnect, String> {
        let class = CString::new("IOHIDSystem").map_err(|e| e.to_string())?;
        let matching = IOServiceMatching(class.as_ptr());
        if matching.is_null() {
            return Err("IOServiceMatching(IOHIDSystem) failed".into());
        }
        let mut iter: IoIterator = 0;
        let kr = IOServiceGetMatchingServices(K_IO_MAIN_PORT_DEFAULT, matching, &mut iter);
        if kr != 0 {
            return Err(format!("IOServiceGetMatchingServices failed ({kr})"));
        }
        let service = IOIteratorNext(iter);
        IOObjectRelease(iter);
        if service == 0 {
            return Err("No IOHIDSystem service".into());
        }
        let mut connect: IoConnect = 0;
        let kr = IOServiceOpen(
            service,
            mach_task_self(),
            K_IO_HID_PARAM_CONNECT_TYPE,
            &mut connect,
        );
        IOObjectRelease(service);
        if kr != 0 || connect == 0 {
            return Err(format!("IOServiceOpen(IOHIDSystem) failed ({kr})"));
        }
        Ok(connect)
    }

    fn post_aux(nx_key: u8) -> Result<(), String> {
        let connect = event_driver()?;
        let loc = IOGPoint { x: 0, y: 0 };
        for key_state in [NX_KEYDOWN, NX_KEYUP] {
            let mut event = unsafe { MaybeUninit::<NXEventData>::zeroed().assume_init() };
            event.sub_type = NX_SUBTYPE_AUX_CONTROL_BUTTONS;
            event.misc_l[0] = ((nx_key as i32) << 16) | (key_state << 8);
            // SAFETY: connect opened via IOServiceOpen; event layout matches NX aux compound.
            let kr = unsafe {
                IOHIDPostEvent(
                    connect,
                    NX_SYSDEFINED,
                    loc,
                    &event,
                    K_NX_EVENT_DATA_VERSION,
                    0,
                    0,
                )
            };
            if kr != 0 {
                return Err(format!("IOHIDPostEvent failed ({kr})"));
            }
        }
        Ok(())
    }

    pub fn tap(kind: MediaKind) -> Result<(), String> {
        let key = match kind {
            MediaKind::PlayPause => NX_KEYTYPE_PLAY,
            MediaKind::Next => NX_KEYTYPE_NEXT,
            MediaKind::Prev => NX_KEYTYPE_PREVIOUS,
        };
        post_aux(key)
    }
}
