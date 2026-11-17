#!/usr/bin/env bash
# Copies this add-on into a Docmost checkout and registers its two modules.
# Safe to run more than once: nothing is duplicated on a second run.
set -euo pipefail

DOCMOST_DIR="${1:-}"
if [[ -z "$DOCMOST_DIR" ]]; then
  echo "usage: ./apply.sh /path/to/docmost" >&2
  exit 1
fi
if [[ ! -f "$DOCMOST_DIR/apps/server/src/app.module.ts" ]]; then
  echo "error: $DOCMOST_DIR does not look like a Docmost checkout" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$DOCMOST_DIR/apps/server/src"

echo "==> copying source"
mkdir -p "$SERVER/core/template/dto" "$SERVER/integrations/daily-task"
cp -v "$HERE/src/core/template/template.controller.ts" \
      "$HERE/src/core/template/template.service.ts" \
      "$HERE/src/core/template/template.module.ts" "$SERVER/core/template/"
cp -v "$HERE/src/core/template/dto/template.dto.ts" "$SERVER/core/template/dto/"
cp -v "$HERE/src/integrations/daily-task/daily-task.service.ts" \
      "$HERE/src/integrations/daily-task/daily-task.controller.ts" \
      "$HERE/src/integrations/daily-task/daily-task.module.ts" \
      "$HERE/src/integrations/daily-task/daily-task.util.ts" \
      "$SERVER/integrations/daily-task/"
if [[ -f "$HERE/src/integrations/daily-task/daily-task.util.spec.ts" ]]; then
  cp -v "$HERE/src/integrations/daily-task/daily-task.util.spec.ts" \
        "$SERVER/integrations/daily-task/"
fi

echo "==> registering modules"
python3 - "$DOCMOST_DIR" <<'PY'
import sys, re, pathlib

root = pathlib.Path(sys.argv[1])

def patch(path, import_line, module_name, anchor):
    p = root / path
    s = p.read_text()
    changed = False

    if import_line not in s:
        # put the import right after the last existing import statement
        imports = list(re.finditer(r"^import .*?;$", s, re.M))
        end = imports[-1].end()
        s = s[:end] + "\n" + import_line + s[end:]
        changed = True

    # add to the imports: [...] array of the @Module decorator
    if not re.search(rf"^\s*{module_name},\s*$", s, re.M):
        idx = s.index(anchor)
        line_start = s.rindex("\n", 0, idx) + 1
        indent = re.match(r"\s*", s[line_start:idx]).group(0)
        s = s[:line_start] + f"{indent}{module_name},\n" + s[line_start:]
        changed = True

    if changed:
        p.write_text(s)
        print(f"  patched {path}: {module_name}")
    else:
        print(f"  {path}: {module_name} already registered")

patch(
    "apps/server/src/core/core.module.ts",
    "import { TemplateModule } from './template/template.module';",
    "TemplateModule",
    "SessionModule,",
)
patch(
    "apps/server/src/app.module.ts",
    "import { DailyTaskModule } from './integrations/daily-task/daily-task.module';",
    "DailyTaskModule",
    "CoreModule,",
)
PY

echo "==> done. Rebuild the image for the change to take effect."
