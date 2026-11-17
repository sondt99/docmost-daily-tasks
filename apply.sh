#!/usr/bin/env bash
# Copies this add-on into a Docmost checkout and wires it in.
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
CLIENT="$DOCMOST_DIR/apps/client/src"

echo "==> copying server source"
# Whole directories, not a hand-written list: a file added here must never be
# silently left out of the build.
mkdir -p "$SERVER/core/template/dto" "$SERVER/integrations/daily-task"
cp -v "$HERE/src/core/template/"*.ts "$SERVER/core/template/"
cp -v "$HERE/src/core/template/dto/"*.ts "$SERVER/core/template/dto/"
cp -v "$HERE/src/integrations/daily-task/"*.ts "$SERVER/integrations/daily-task/"

echo "==> copying client source"
mkdir -p "$CLIENT/features/page-template/components"
cp -v "$HERE/client/src/features/page-template/"*.ts "$CLIENT/features/page-template/"
cp -v "$HERE/client/src/features/page-template/components/"*.tsx \
      "$CLIENT/features/page-template/components/"

mkdir -p "$CLIENT/features/editor/extensions"
cp -v "$HERE/client/src/features/editor/extensions/"*.ts \
      "$CLIENT/features/editor/extensions/"

echo "==> wiring it in"
python3 - "$DOCMOST_DIR" <<'PY'
import sys, re, pathlib

root = pathlib.Path(sys.argv[1])


def register_module(path, import_line, module_name, anchor):
    """Adds a Nest module to another module's imports: [...] array."""
    p = root / path
    s = p.read_text()
    changed = False

    if import_line not in s:
        imports = list(re.finditer(r"^import .*?;$", s, re.M))
        end = imports[-1].end()
        s = s[:end] + "\n" + import_line + s[end:]
        changed = True

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


def insert_before(path, anchor, block, marker):
    """Inserts `block` immediately before `anchor`, once."""
    p = root / path
    s = p.read_text()

    if marker in s:
        print(f"  {path}: {marker} already present")
        return

    if anchor not in s:
        raise SystemExit(
            f"error: could not find the anchor in {path}.\n"
            f"Docmost has moved it; update apply.sh before building.\n"
            f"anchor was:\n{anchor}"
        )

    s = s.replace(anchor, block + anchor, 1)
    p.write_text(s)
    print(f"  patched {path}: {marker}")


def add_import(path, import_line):
    p = root / path
    s = p.read_text()
    if import_line in s:
        return
    imports = list(re.finditer(r"^import .*?;$", s, re.M))
    end = imports[-1].end()
    s = s[:end] + "\n" + import_line + s[end:]
    p.write_text(s)
    print(f"  patched {path}: import")


# --- server ----------------------------------------------------------------
register_module(
    "apps/server/src/core/core.module.ts",
    "import { TemplateModule } from './template/template.module';",
    "TemplateModule",
    "SessionModule,",
)
register_module(
    "apps/server/src/app.module.ts",
    "import { DailyTaskModule } from './integrations/daily-task/daily-task.module';",
    "DailyTaskModule",
    "CoreModule,",
)

# --- client ----------------------------------------------------------------
HEADER_MENU = "apps/client/src/features/page/components/header/page-header-menu.tsx"

add_import(
    HEADER_MENU,
    'import {\n'
    '  PageTemplateMenuItems,\n'
    '  PageTemplateModals,\n'
    '} from "@/features/page-template";',
)

EXTENSIONS = "apps/client/src/features/editor/extensions/extensions.ts"

add_import(
    EXTENSIONS,
    'import { ContinuedOrderedList } from '
    '"@/features/editor/extensions/continued-ordered-list";',
)

insert_before(
    EXTENSIONS,
    anchor="  TaskList,\n",
    block="  ContinuedOrderedList,\n",
    marker="ContinuedOrderedList,",
)

insert_before(
    HEADER_MENU,
    anchor=(
        "          <Menu.Item\n"
        "            leftSection={<IconFileExport size={16} />}\n"
        "            onClick={openExportModal}\n"
        "          >"
    ),
    block="          <PageTemplateMenuItems readOnly={readOnly} />\n\n",
    marker="<PageTemplateMenuItems",
)

insert_before(
    HEADER_MENU,
    anchor=(
        "      <ExportModal\n"
        '        type="page"\n'
        "        id={page.id}"
    ),
    block=(
        "      <PageTemplateModals\n"
        "        pageId={page.id}\n"
        "        spaceId={page.spaceId}\n"
        "        pageTitle={page.title}\n"
        "      />\n\n"
    ),
    marker="<PageTemplateModals",
)
PY

echo "==> done. Rebuild the image for the change to take effect."
