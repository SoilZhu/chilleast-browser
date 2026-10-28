#!/usr/bin/env python3
"""
站点图标生成器（favicon / apple-touch / PWA）
----------------------------------------------------------------------------
从 `assets/brand/` 里的两张原图（浅色版 / 深色版）裁出站点图标：

    logo-light.png  1800×1800，白底 + 东湖绿圆环链
    logo-dark.png   1800×1800，#191919 底 + 东湖绿圆环链

裁切规则（按需求：**保留原底色，只做裁切**）：
  1. 以底色（左上角像素）为基准找出图案的包围盒；
  2. 补成正方形，图案居中；
  3. 四周留 4% 呼吸位，避免图案顶到图标边缘。

输出到 `web/public/`：
  favicon.ico                        16/32/48 三档（浅色，根路径兜底）
  icons/favicon-{16,32,48}.png       浅色，prefers-color-scheme: light
  icons/favicon-{16,32,48}-dark.png  深色，prefers-color-scheme: dark
  icons/apple-touch-icon.png         180×180，不透明（iOS 自己加圆角遮罩）
  icons/icon-{192,512}.png           PWA any
  icons/icon-512-maskable.png        PWA maskable（图案收进 80% 安全区）
  brand/mark-light.png               网页内品牌标（抠底透明版）

用法：python3 scripts/build-logo-icons.py
依赖：python3 + Pillow + numpy
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit('缺少依赖：pip install pillow numpy')

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'brand'
PUB = ROOT / 'web' / 'public'
ICONS = PUB / 'icons'
# 网页内品牌标（抠底透明版），放 public 下按 URL 引用，与 campus_bus_map.webp 一致
MARKS = PUB / 'brand'

SOURCES = {
    'light': SRC / 'logo-light.png',
    'dark': SRC / 'logo-dark.png',
}

# 图案四周留白（相对边长）
PADDING = 0.04
# maskable 图标：图案缩到画布的 60%，让内容全部落在 80% 直径的安全圆内
MASKABLE_SCALE = 0.60
# 网页内品牌标的导出宽度（px）；各处最大用到 80px，2x 屏留足余量
MARK_WIDTH = 240


def background_color(im: Image.Image) -> tuple[int, int, int]:
    """取左上角像素作为底色。"""
    return tuple(int(v) for v in im.convert('RGB').getpixel((0, 0)))


def content_box(im: Image.Image, tol: int = 24) -> tuple[int, int, int, int]:
    """返回图案（与底色差异超过 tol 的像素）的包围盒。"""
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    bg = rgb[0, 0]
    mask = np.abs(rgb - bg).sum(axis=2) > tol
    ys, xs = np.where(mask)
    if xs.size == 0:
        raise ValueError('未找到图案内容')
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def square_master(im: Image.Image, pad: float = PADDING) -> Image.Image:
    """把图案裁出来、居中放进正方形画布，并留出 pad 比例的白边。"""
    bg = background_color(im)
    x0, y0, x1, y1 = content_box(im)
    crop = im.convert('RGB').crop((x0, y0, x1 + 1, y1 + 1))
    w, h = crop.size
    side = max(w, h)
    canvas = Image.new('RGB', (side, side), bg)
    canvas.paste(crop, ((side - w) // 2, (side - h) // 2))

    if pad > 0:
        inner = max(1, int(round(side * (1 - 2 * pad))))
        shrunk = canvas.resize((inner, inner), Image.LANCZOS)
        canvas = Image.new('RGB', (side, side), bg)
        canvas.paste(shrunk, ((side - inner) // 2, (side - inner) // 2))
    return canvas


def resized(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.LANCZOS)


def maskable(master: Image.Image, size: int) -> Image.Image:
    """图案收进安全区，背景铺满整张画布。"""
    bg = background_color(master)
    inner = max(1, int(round(size * MASKABLE_SCALE)))
    canvas = Image.new('RGB', (size, size), bg)
    canvas.paste(resized(master, inner), ((size - inner) // 2, (size - inner) // 2))
    return canvas


def solid_color(im: Image.Image) -> tuple[int, int, int]:
    """图案里占比最高的颜色（圆环的实体绿）。"""
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    bg = rgb[0, 0]
    mask = np.abs(rgb - bg).sum(axis=2) > 24
    pixels = rgb[mask].reshape(-1, 3)
    if pixels.size == 0:
        raise ValueError('未找到图案内容')
    colors, counts = np.unique(pixels, axis=0, return_counts=True)
    return tuple(int(v) for v in colors[counts.argmax()])


def transparent_mark(im: Image.Image, target_width: int) -> Image.Image:
    """
    抠底版本：给网页内的品牌标用。

    原图是不透明白底，直接贴到页面里，遇到 hover 变色的容器会露出白块。
    这里按「像素离底色的距离」估覆盖率当 alpha，前景统一刷成实体绿，
    边缘保留抗锯齿过渡。
    """
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    bg = rgb[0, 0]
    fg = np.array(solid_color(im), dtype=np.float32)

    # 沿 底色→前景色 的连线投影，得到每个像素的前景覆盖率
    axis = fg - bg
    denom = float(np.dot(axis, axis))
    coverage = np.clip(((rgb - bg) @ axis) / denom, 0.0, 1.0)

    x0, y0, x1, y1 = content_box(im)
    coverage = coverage[y0:y1 + 1, x0:x1 + 1]

    height, width = coverage.shape
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., 0] = int(fg[0])
    out[..., 1] = int(fg[1])
    out[..., 2] = int(fg[2])
    out[..., 3] = (coverage * 255).round().astype(np.uint8)

    mark = Image.fromarray(out, 'RGBA')
    if target_width and target_width != width:
        ratio = target_width / width
        mark = mark.resize((target_width, max(1, round(height * ratio))), Image.LANCZOS)
    return mark


def write_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'PNG', optimize=True)


def write_ico(master: Image.Image, path: Path, sizes: tuple[int, ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    base = resized(master, max(sizes))
    base.save(path, 'ICO', sizes=[(s, s) for s in sizes])


def main() -> int:
    masters: dict[str, Image.Image] = {}
    for name, path in SOURCES.items():
        if not path.exists():
            sys.exit(f'缺少源文件：{path}')
        masters[name] = square_master(Image.open(path))
        print(f'  {name:<5} {path.name} -> master {masters[name].size[0]}px, '
              f'底色 #{background_color(masters[name])[0]:02x}'
              f'{background_color(masters[name])[1]:02x}'
              f'{background_color(masters[name])[2]:02x}')

    light, dark = masters['light'], masters['dark']
    ICONS.mkdir(parents=True, exist_ok=True)

    # ---- 浅色：favicon / apple-touch / PWA ----
    write_ico(light, PUB / 'favicon.ico', (16, 32, 48))
    for size in (16, 32, 48):
        write_png(resized(light, size), ICONS / f'favicon-{size}.png')
    write_png(resized(light, 180), ICONS / 'apple-touch-icon.png')
    write_png(resized(light, 192), ICONS / 'icon-192.png')
    write_png(resized(light, 512), ICONS / 'icon-512.png')
    write_png(maskable(light, 512), ICONS / 'icon-512-maskable.png')

    # ---- 深色：只有标签页图标能感知系统配色，所以只出 favicon PNG ----
    for size in (16, 32, 48):
        write_png(resized(dark, size), ICONS / f'favicon-{size}-dark.png')

    # ---- 网页内品牌标：抠底透明 PNG（网页本身无深色主题，只出浅色版）----
    mark = transparent_mark(Image.open(SOURCES['light']), MARK_WIDTH)
    write_png(mark, MARKS / 'mark-light.png')
    print(f'  mark-light.png {mark.size[0]}×{mark.size[1]}')

    # ---- 自检 ----
    expected = {
        PUB / 'favicon.ico': None,
        ICONS / 'favicon-16.png': (16, 16),
        ICONS / 'favicon-32.png': (32, 32),
        ICONS / 'favicon-48.png': (48, 48),
        ICONS / 'favicon-16-dark.png': (16, 16),
        ICONS / 'favicon-32-dark.png': (32, 32),
        ICONS / 'favicon-48-dark.png': (48, 48),
        ICONS / 'apple-touch-icon.png': (180, 180),
        ICONS / 'icon-192.png': (192, 192),
        ICONS / 'icon-512.png': (512, 512),
        ICONS / 'icon-512-maskable.png': (512, 512),
        MARKS / 'mark-light.png': None,
    }
    for path, size in expected.items():
        if not path.exists():
            sys.exit(f'生成失败，缺少 {path}')
        if size is not None and Image.open(path).size != size:
            sys.exit(f'尺寸不符：{path} -> {Image.open(path).size}，期望 {size}')
        print(f'  ✓ {path.relative_to(ROOT)}  {path.stat().st_size} B')

    print(f'\n完成：{len(expected)} 个图标已写入 web/public/')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
