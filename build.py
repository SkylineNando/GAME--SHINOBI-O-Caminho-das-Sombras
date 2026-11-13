#!/usr/bin/env python3
"""Gera web/index.html (versão navegador) a partir de web/src/*.js, web/shell.html e DATA/ de data/."""
import json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(HERE, "data")
L = lambda p: json.load(open(os.path.join(R, p), encoding="utf-8"))
data = {"animations": L("characters/animations.json"), "skins": L("characters/skins.json"), "kage": L("characters/kage.json"),
        "enemies": L("enemies/enemies.json"), "bosses": L("enemies/bosses.json"), "weapons": L("weapons/weapons.json"),
        "shop": L("weapons/shop.json"), "levels": {str(n): L(f"levels/level_{n}.json") for n in range(1, 6)}}
code = "\n".join(open(f, encoding="utf-8").read() for f in sorted(glob.glob(os.path.join(HERE, "src", "*.js"))))
html = open(os.path.join(HERE, "shell.html"), encoding="utf-8").read()
html = html.replace("/*DATA*/", json.dumps(data, ensure_ascii=False, separators=(",", ":"))).replace("/*CODE*/", code)
open(os.path.join(HERE, "index.html"), "w", encoding="utf-8").write(html)
print("index.html", len(html) // 1024, "KB")
