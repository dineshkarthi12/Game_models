"""Minimal GLB reader: JSON chunk + binary chunk, image dimensions from PNG/JPEG headers."""
import json, struct


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        raise ValueError("Not a GLB file (bad magic)")
    _, _, length = struct.unpack_from("<4sII", data, 0)
    off, js, binc = 12, None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def image_size(buf):
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", buf[16:24]); return w, h, "image/png"
    if buf[:2] == b"\xff\xd8":
        i = 2
        while i < len(buf) - 9:
            if buf[i] != 0xFF:
                i += 1; continue
            marker = buf[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", buf[i + 5:i + 9]); return w, h, "image/jpeg"
            seg = struct.unpack(">H", buf[i + 2:i + 4])[0]; i += 2 + seg
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return None, None, "image/webp"
    return None, None, "unknown"


def images(js, binc):
    out = []
    for i, im in enumerate(js.get("images", [])):
        w = h = None; mime = im.get("mimeType", "unknown")
        if "bufferView" in im:
            bv = js["bufferViews"][im["bufferView"]]
            s = bv.get("byteOffset", 0)
            w, h, mime2 = image_size(binc[s: s + bv["byteLength"]]); mime = mime2 if mime2 != "unknown" else mime
        out.append({"index": i, "name": im.get("name") or f"image_{i}", "width": w, "height": h, "mime": mime})
    return out
