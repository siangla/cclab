"""
深層掃描 Teams WebView2 內容，找字幕元素
請確保 Teams 開會中且已開啟即時字幕再執行
"""
import uiautomation as auto
import time

def find_all_text(ctrl, depth=0, max_depth=20, results=None):
    if results is None:
        results = []
    if depth > max_depth:
        return results
    try:
        name = (ctrl.Name or "").strip().replace("\n", " ")
        ctype = ctrl.ControlTypeName or ""
        cls   = ctrl.ClassName or ""
        aid   = getattr(ctrl, "AutomationId", "") or ""

        # 收集所有有文字的元素
        if name and len(name) > 3:
            results.append({
                "depth": depth,
                "type": ctype,
                "name": name,
                "aid": aid,
                "cls": cls,
            })

        for child in ctrl.GetChildren():
            find_all_text(child, depth + 1, max_depth, results)
    except Exception:
        pass
    return results

def find_teams():
    root = auto.GetRootControl()
    for w in root.GetChildren():
        if "TeamsWebView" in (w.ClassName or "") or "Teams" in (w.Name or ""):
            return w
    return None

print("搜尋 Teams 視窗...")
win = find_teams()
if not win:
    print("找不到 Teams 視窗")
    exit()

print(f"找到：{win.Name[:60]}")
print("深層掃描中（最多 20 層，請稍候）...\n")

results = find_all_text(win, max_depth=20)

print(f"共找到 {len(results)} 個有文字的元素\n")
print("=" * 70)

# 依文字長度排序，長的通常是字幕
results.sort(key=lambda x: -len(x["name"]))

for r in results[:80]:
    pad = "  " * min(r["depth"], 6)
    print(f"[depth={r['depth']}][{r['type']}] {repr(r['name'][:100])}")
    if r["aid"]:
        print(f"{pad}  aid={repr(r['aid'])}  cls={repr(r['cls'])}")

with open("uia_text_elements.txt", "w", encoding="utf-8") as f:
    for r in results:
        f.write(f"[d={r['depth']}][{r['type']}] name={repr(r['name'])}  aid={repr(r['aid'])}  cls={repr(r['cls'])}\n")

print(f"\n完整清單已存至 uia_text_elements.txt")
