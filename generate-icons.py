"""Run once to generate placeholder PWA icons: python generate-icons.py"""
import struct, zlib, base64

def make_png(size, bg=(10, 10, 15), fg=(124, 58, 237)):
    """Generate a minimal PNG with a solid background + centered glove emoji placeholder."""
    row = []
    for y in range(size):
        row_data = b'\x00'
        for x in range(size):
            cx, cy = size // 2, size // 2
            r = size * 0.38
            dist = ((x - cx)**2 + (y - cy)**2) ** 0.5
            if dist < r:
                row_data += bytes(fg) + b'\xff'
            else:
                row_data += bytes(bg) + b'\xff'
        row.append(row_data)

    raw = b''.join(row)
    compressed = zlib.compress(raw)

    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    return png

for size in (192, 512):
    data = make_png(size)
    path = f"frontend/public/icon-{size}.png"
    with open(path, 'wb') as f:
        f.write(data)
    print(f"Created {path}")
