"""
診斷：掃描 Teams 視窗的 UIA 元素樹，找出字幕所在位置
執行時請確保 Teams 正在開會且已開啟即時字幕
"""
import uiautomation as auto
import time

def dump_tree(ctrl, depth=0, max_depth=8, output=None):
    if depth > max_depth:
        return
    try:
        name = (ctrl.Name or "").strip().replace("\n", " ")[:80]
        aid  = getattr(ctrl, "AutomationId", "") or ""
        cls  = ctrl.ClassName or ""
        ctype = ctrl.ControlTypeName or ""
        line = f"{'  ' * depth}[{ctype}] name={repr(name)} aid={repr(aid)} cls={repr(cls)}"
        print(line)
        if output is not None:
            output.append(line)
        for child in ctrl.GetChildren():
            dump_tree(child, depth + 1, max_depth, output)
    except Exception as e:
        print(f"{'  '*depth}!! {e}")

def find_teams_window():
    # 新版 Teams (WebView2)
    root = auto.GetRootControl()
    for win in root.GetChildren():
        name = win.Name or ""
        cls  = win.ClassName or ""
        if "Teams" in name or "ms-teams" in cls.lower() or "TeamsWebView" in cls:
            return win
    return None

print("=== 搜尋 Teams 視窗 ===")
win = find_teams_window()
if win is None:
    print("找不到 Teams 視窗，列出所有頂層視窗：")
    root = auto.GetRootControl()
    for w in root.GetChildren():
        print(f"  Name={repr((w.Name or '')[:60])}  ClassName={repr(w.ClassName or '')}")
else:
    print(f"找到：Name={repr(win.Name)}  ClassName={repr(win.ClassName)}\n")
    print("=== UIA 元素樹（最多 8 層）===")
    lines = []
    dump_tree(win, max_depth=8, output=lines)
    # 同時存檔方便查看
    with open("uia_tree.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\n已儲存完整結果至 uia_tree.txt（共 {len(lines)} 行）")
    print("\n=== 包含文字的元素（name 長度 > 5）===")
    for l in lines:
        if "name=" in l:
            import re
            m = re.search(r"name='([^']{5,})'", l)
            if m:
                print(l)
