/**
 * Framed JSON codec — synchronous & async variants.
 *
 * Wire format: [4-byte u32 LE length][UTF-8 JSON payload]
 * TS source of truth: contracts/ipc.ts  (framing section)
 * Python mirror:      sidecar/protocol.py
 */
use std::io::{Read, Write};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Hard cap shared with the Python sidecar (sidecar/protocol.py MAX_FRAME_BYTES).
pub const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024; // 4 MiB

// ── Synchronous (used in tests and sync contexts) ─────────────────────────────

pub fn write_frame<W: Write>(writer: &mut W, payload: &[u8]) -> std::io::Result<()> {
    let len = u32::try_from(payload.len())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "frame too large"))?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(payload)?;
    writer.flush()
}

pub fn read_frame<R: Read>(reader: &mut R) -> std::io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > MAX_FRAME_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("incoming frame too large: {len} bytes (max {MAX_FRAME_BYTES})"),
        ));
    }
    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload)?;
    Ok(payload)
}

// ── Async (used for live sidecar I/O) ────────────────────────────────────────

pub async fn write_frame_async<W>(writer: &mut W, payload: &[u8]) -> anyhow::Result<()>
where
    W: AsyncWriteExt + Unpin,
{
    let len = u32::try_from(payload.len())
        .map_err(|_| anyhow::anyhow!("frame payload exceeds 4 GiB limit"))?;
    writer.write_all(&len.to_le_bytes()).await?;
    writer.write_all(payload).await?;
    writer.flush().await?;
    Ok(())
}

pub async fn read_frame_async<R>(reader: &mut R) -> anyhow::Result<Vec<u8>>
where
    R: AsyncReadExt + Unpin,
{
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf).await?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > MAX_FRAME_BYTES {
        anyhow::bail!("incoming frame too large: {len} bytes (max {MAX_FRAME_BYTES})");
    }
    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload).await?;
    Ok(payload)
}

// ── Serialisation helpers ─────────────────────────────────────────────────────

pub fn encode_message<T: serde::Serialize>(msg: &T) -> anyhow::Result<Vec<u8>> {
    Ok(serde_json::to_vec(msg)?)
}

pub fn decode_message<T: serde::de::DeserializeOwned>(data: &[u8]) -> anyhow::Result<T> {
    Ok(serde_json::from_slice(data)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn sync_roundtrip_empty_payload() {
        let payload = b"";
        let mut buf = Vec::new();
        write_frame(&mut buf, payload).unwrap();
        let out = read_frame(&mut Cursor::new(&buf)).unwrap();
        assert_eq!(out, payload);
    }

    #[test]
    fn sync_roundtrip_json_payload() {
        let payload = br#"{"type":"ready","version":"0.1.0"}"#;
        let mut buf = Vec::new();
        write_frame(&mut buf, payload).unwrap();
        let out = read_frame(&mut Cursor::new(&buf)).unwrap();
        assert_eq!(out, payload);
    }

    #[test]
    fn frame_header_is_little_endian() {
        let payload = b"hello";
        let mut buf = Vec::new();
        write_frame(&mut buf, payload).unwrap();
        let len = u32::from_le_bytes(buf[..4].try_into().unwrap());
        assert_eq!(len as usize, payload.len());
    }

    #[test]
    fn multiple_frames_in_sequence() {
        let frames: &[&[u8]] = &[b"first", b"second", b"third"];
        let mut buf = Vec::new();
        for f in frames {
            write_frame(&mut buf, f).unwrap();
        }
        let mut cur = Cursor::new(&buf);
        for expected in frames {
            let got = read_frame(&mut cur).unwrap();
            assert_eq!(&got, expected);
        }
    }

    #[test]
    fn read_frame_rejects_oversized() {
        // Synthesise a header claiming MAX_FRAME_BYTES + 1 bytes.
        let bad_len = (MAX_FRAME_BYTES + 1) as u32;
        let header = bad_len.to_le_bytes();
        let err = read_frame(&mut Cursor::new(&header)).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn encode_decode_roundtrip() {
        use crate::ipc::SidecarMessage;
        let msg = SidecarMessage::Ready {
            version: "0.1.0".to_string(),
        };
        let encoded = encode_message(&msg).unwrap();
        let decoded: SidecarMessage = decode_message(&encoded).unwrap();
        if let SidecarMessage::Ready { version } = decoded {
            assert_eq!(version, "0.1.0");
        } else {
            panic!("wrong variant");
        }
    }

    #[tokio::test]
    async fn async_roundtrip() {
        use tokio::io::BufReader;
        let payload = br#"{"type":"shutdown"}"#;
        let mut buf: Vec<u8> = Vec::new();
        write_frame_async(&mut buf, payload).await.unwrap();
        let mut reader = BufReader::new(Cursor::new(buf));
        let out = read_frame_async(&mut reader).await.unwrap();
        assert_eq!(out, payload);
    }

    #[tokio::test]
    async fn async_read_rejects_oversized() {
        use tokio::io::BufReader;
        let bad_len = (MAX_FRAME_BYTES + 1) as u32;
        let header = bad_len.to_le_bytes();
        let mut reader = BufReader::new(Cursor::new(header.to_vec()));
        let err = read_frame_async(&mut reader).await.unwrap_err();
        assert!(err.to_string().contains("too large"), "got: {err}");
    }
}
