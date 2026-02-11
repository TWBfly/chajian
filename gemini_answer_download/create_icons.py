#!/usr/bin/env python3
"""
生成 Chrome 扩展所需的图标文件
"""

from PIL import Image, ImageDraw
import os

# 获取脚本所在目录
script_dir = os.path.dirname(os.path.abspath(__file__))

# 图标尺寸
sizes = [16, 48, 128]

for size in sizes:
    # 创建图像
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 绘制渐变背景圆形
    padding = int(size * 0.05)
    for i in range(size - 2 * padding):
        # 从紫色到蓝色的渐变
        ratio = i / (size - 2 * padding)
        r = int(102 + (118 - 102) * ratio)  # 667eea -> 764ba2
        g = int(126 + (75 - 126) * ratio)
        b = int(234 + (162 - 234) * ratio)
        
        # 绘制圆形的一部分
        y = padding + i
        draw.ellipse([padding, padding, size - padding, size - padding], 
                    fill=(102, 126, 234, 255))
    
    # 绘制圆形背景
    draw.ellipse([padding, padding, size - padding, size - padding], 
                fill=(102, 126, 234, 255))
    
    # 绘制下载箭头符号
    arrow_color = (255, 255, 255, 255)
    center_x = size // 2
    center_y = size // 2
    
    # 箭头主体（垂直线）
    line_width = max(1, size // 8)
    arrow_height = int(size * 0.35)
    draw.rectangle([
        center_x - line_width // 2, 
        center_y - arrow_height // 2,
        center_x + line_width // 2, 
        center_y + arrow_height // 2
    ], fill=arrow_color)
    
    # 箭头头部（三角形）
    arrow_head_size = int(size * 0.25)
    triangle_top = center_y + arrow_height // 4
    draw.polygon([
        (center_x, center_y + arrow_height // 2 + arrow_head_size // 2),  # 底部中点
        (center_x - arrow_head_size // 2, triangle_top),  # 左上
        (center_x + arrow_head_size // 2, triangle_top),  # 右上
    ], fill=arrow_color)
    
    # 底部横线
    line_y = int(size * 0.75)
    line_length = int(size * 0.5)
    draw.rectangle([
        center_x - line_length // 2,
        line_y - line_width // 2,
        center_x + line_length // 2,
        line_y + line_width // 2
    ], fill=arrow_color)
    
    # 保存图标
    output_path = os.path.join(script_dir, f'icon{size}.png')
    img.save(output_path, 'PNG')
    print(f'已创建: {output_path}')

print('所有图标已生成完成！')
