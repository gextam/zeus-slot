"""Report alpha-channel statistics of 8-bit RGBA PNG files (pure Python + numpy).
usage: python tools/pngalpha.py file1.png [file2.png ...]"""
import struct, sys, zlib
import numpy as np

def decode(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, w, h, ct = 8, [], 0, 0, 0
    while pos < len(data):
        ln, = struct.unpack('>I', data[pos:pos + 4]); typ = data[pos + 4:pos + 8]; body = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if typ == b'IHDR':
            w, h, bd, ct, _, _, il = struct.unpack('>IIBBBBB', body)
            assert bd == 8 and il == 0, 'only 8-bit non-interlaced supported'
        elif typ == b'IDAT': idat.append(body)
        elif typ == b'IEND': break
    ch = {6: 4, 2: 3, 4: 2, 0: 1}[ct]
    raw = zlib.decompress(b''.join(idat))
    stride = w * ch
    out = np.zeros((h, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.int32)
    i = 0
    for y in range(h):
        f = raw[i]; i += 1
        line = np.frombuffer(raw[i:i + stride], dtype=np.uint8).astype(np.int32); i += stride
        if f == 0: cur = line
        elif f == 2: cur = (line + prev) & 255
        elif f == 1:
            cur = line.reshape(w, ch); cur = np.cumsum(cur, axis=0) & 255; cur = cur.reshape(stride)
        else:
            cur = line.copy(); lst = cur.tolist(); pv = prev.tolist()
            for x in range(stride):
                a = lst[x - ch] if x >= ch else 0; b = pv[x]; c = pv[x - ch] if x >= ch else 0
                if f == 3: lst[x] = (lst[x] + ((a + b) >> 1)) & 255
                else:
                    p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    lst[x] = (lst[x] + pr) & 255
            cur = np.array(lst, dtype=np.int32)
        out[y] = cur.astype(np.uint8); prev = cur
    return out.reshape(h, w, ch), ct

for path in sys.argv[1:]:
    img, ct = decode(path)
    if ct != 6:
        print(path, 'no alpha channel (color type %d)' % ct); continue
    a = img[:, :, 3]
    h, w = a.shape
    print('%s  %dx%d  alpha<255: %.1f%%  alpha==0: %.1f%%  corners: %s  center: %d' % (
        path, w, h, 100.0 * (a < 255).mean(), 100.0 * (a == 0).mean(),
        [int(a[0, 0]), int(a[0, w - 1]), int(a[h - 1, 0]), int(a[h - 1, w - 1])], int(a[h // 2, w // 2])))
