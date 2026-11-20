#!/usr/bin/env python3
"""Zip an export directory. Usage: package.py <dir> <out.zip> <root_folder_name> <json list of relative paths to include>"""
import sys, os, json, zipfile
src, out, root = sys.argv[1], sys.argv[2], sys.argv[3]
include = json.loads(sys.argv[4])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for rel in include:
        p = os.path.join(src, rel)
        if os.path.isdir(p):
            for dp, _, fs in os.walk(p):
                for f in fs:
                    full = os.path.join(dp, f); z.write(full, os.path.join(root, os.path.relpath(full, src)))
        elif os.path.exists(p):
            z.write(p, os.path.join(root, rel))
print("PACKAGE_OK " + str(os.path.getsize(out)))
