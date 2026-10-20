"""Rebuild app icons from mark.svg using only the Python standard library.

This small rasterizer deliberately supports only the shapes used by our mark.
Unsupported SVG changes fail instead of silently producing a different logo.
"""
from pathlib import Path
import hashlib
import math
import re
import struct
import xml.etree.ElementTree as ET
import zlib


def _color(value):
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("Icon source requires six-digit SVG colors")
    return tuple(bytes.fromhex(value[1:])) + (255,)


def _path(value):
    tokens = re.findall(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)", value)
    if re.sub(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)|[\s,]", "", value):
        raise ValueError("Unsupported SVG path syntax")
    segments, position, index = [], (0.0, 0.0), 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        if command not in ("M", "m", "V", "v", "C", "c"):
            raise ValueError("Unsupported SVG path command: " + command)
        count = {"M": 2, "V": 1, "C": 6}[command.upper()]
        values = [float(v) for v in tokens[index:index + count]]
        if len(values) != count:
            raise ValueError("Incomplete SVG path command")
        index += count
        relative = command.islower()
        x, y = position
        if command.upper() == "M":
            position = (values[0] + (x if relative else 0),
                        values[1] + (y if relative else 0))
        elif command.upper() == "V":
            target = (x, values[0] + (y if relative else 0))
            segments.append((position, target))
            position = target
        else:
            controls = [(values[i] + (x if relative else 0),
                         values[i + 1] + (y if relative else 0))
                        for i in range(0, 6, 2)]
            previous = position
            for step in range(1, 33):
                t = step / 32
                u = 1 - t
                target = tuple(u ** 3 * position[k] + 3 * u * u * t * controls[0][k]
                               + 3 * u * t * t * controls[1][k] + t ** 3 * controls[2][k]
                               for k in (0, 1))
                segments.append((previous, target))
                previous = target
            position = controls[2]
    return segments


def _source(source):
    svg = ET.fromstring(source)
    if svg.tag.split("}")[-1] != "svg" or svg.attrib != {"viewBox": "0 0 64 64"}:
        raise ValueError("Unsupported icon SVG root or viewBox")
    shapes = []
    for element in svg:
        kind = element.tag.split("}")[-1]
        attrs = element.attrib
        allowed = {
            "rect": {"width", "height", "rx", "fill"},
            "path": {"d", "stroke", "stroke-width", "stroke-linecap", "fill"},
            "circle": {"cx", "cy", "r", "fill"},
        }.get(kind)
        if allowed is None or set(attrs) != allowed:
            raise ValueError("Unsupported SVG shape or attributes: " + kind)
        if kind == "rect":
            shapes.append((kind, tuple(float(attrs[k]) for k in ("width", "height", "rx")), _color(attrs["fill"])))
        elif kind == "circle":
            shapes.append((kind, tuple(float(attrs[k]) for k in ("cx", "cy", "r")), _color(attrs["fill"])))
        else:
            if attrs["fill"] != "none" or attrs["stroke-linecap"] != "round":
                raise ValueError("Icon paths require an unfilled round stroke")
            shapes.append((kind, (_path(attrs["d"]), float(attrs["stroke-width"])), _color(attrs["stroke"])))
    if not shapes:
        raise ValueError("Empty SVG icon")
    return shapes


def _png(size, shapes, inset=0.0, background=None, source_hash=""):
    samples = 4
    width = size * samples
    pixels = bytearray(bytes(background or (0, 0, 0, 0)) * (width * width))
    scale = width * (1 - inset * 2) / 64
    offset = width * inset

    def paint(bounds, contains, color):
        left, top, right, bottom = bounds
        rgba = bytes(color)
        for py in range(max(0, math.floor(top)), min(width, math.ceil(bottom))):
            for px in range(max(0, math.floor(left)), min(width, math.ceil(right))):
                if contains(px + 0.5, py + 0.5):
                    start = (py * width + px) * 4
                    pixels[start:start + 4] = rgba

    for kind, values, color in shapes:
        if kind == "rect":
            w, h, radius = (v * scale for v in values)
            def rounded(x, y):
                dx = max(offset + radius - x, 0, x - (offset + w - radius))
                dy = max(offset + radius - y, 0, y - (offset + h - radius))
                return dx * dx + dy * dy <= radius * radius
            paint((offset, offset, offset + w, offset + h), rounded, color)
        elif kind == "circle":
            cx, cy, radius = values
            cx, cy, radius = offset + cx * scale, offset + cy * scale, radius * scale
            paint((cx - radius, cy - radius, cx + radius, cy + radius),
                  lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2, color)
        else:
            segments, stroke = values
            radius = stroke * scale / 2
            for start, end in segments:
                ax, ay = (offset + v * scale for v in start)
                bx, by = (offset + v * scale for v in end)
                dx, dy = bx - ax, by - ay
                length = dx * dx + dy * dy
                def capsule(x, y):
                    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / length)) if length else 0
                    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= radius ** 2
                paint((min(ax, bx) - radius, min(ay, by) - radius,
                       max(ax, bx) + radius, max(ay, by) + radius), capsule, color)

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter: none
        for x in range(size):
            block = [pixels[((y * samples + dy) * width + x * samples + dx) * 4:
                            ((y * samples + dy) * width + x * samples + dx) * 4 + 4]
                     for dy in range(samples) for dx in range(samples)]
            alpha = sum(p[3] for p in block)
            raw.extend([round(sum(p[c] * p[3] for p in block) / alpha) if alpha else 0
                        for c in range(3)] + [round(alpha / (samples * samples))])

    def chunk(name, data):
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", size, size, 8, 6, 0, 0, 0))
            + chunk(b"tEXt", b"Source\0" + source_hash.encode("ascii"))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def generate(root):
    """Write deterministic PNGs; maskable content has a 20% margin on every side."""
    assets = Path(root) / "assets"
    source = (assets / "mark.svg").read_bytes().replace(b"\r\n", b"\n")
    shapes = _source(source)
    source_hash = hashlib.sha256(source + Path(__file__).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    for name, size, inset, background in (
        ("icon-192.png", 192, 0, None),
        ("icon-512.png", 512, 0, None),
        ("icon-maskable-512.png", 512, .2, _color("#174d3c")),
        ("apple-touch-icon.png", 180, 0, _color("#174d3c")),
    ):
        target = assets / name
        # Keep repeat builds fast; changing either source or renderer regenerates.
        if target.exists() and b"Source\0" + source_hash.encode("ascii") in target.read_bytes():
            continue
        data = _png(size, shapes, inset, background, source_hash)
        if not target.exists() or target.read_bytes() != data:
            target.write_bytes(data)


if __name__ == "__main__":
    generate(Path(__file__).resolve().parents[1])
