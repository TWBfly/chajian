#!/usr/bin/env python3
"""生成 PNG 图标文件"""

ICON_SIZES = [16, 48, 128]

# 简单的 PNG 生成（使用纯色背景）
import struct
import zlib

def create_simple_png(size, filename):
    """创建简单的渐变 PNG 图标"""
    
    def png_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack('>I', crc)
    
    # PNG 头
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)
    
    # 图像数据：渐变紫色背景
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'  # filter type
        for x in range(size):
            # 渐变色：从 #667eea 到 #764ba2
            t = (x + y) / (2 * size)
            r = int(102 + (118 - 102) * t)
            g = int(126 + (75 - 126) * t)
            b = int(234 + (162 - 234) * t)
            raw_data += bytes([r, g, b])
    
    compressed = zlib.compress(raw_data)
    idat = png_chunk(b'IDAT', compressed)
    
    # IEND
    iend = png_chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(signature + ihdr + idat + iend)
    
    print(f'Created {filename}')

for size in ICON_SIZES:
    create_simple_png(size, f'icon{size}.png')

print('所有图标已创建完成！')
