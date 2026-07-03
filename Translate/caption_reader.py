"""
字幕讀取器 — 三種策略（依優先順序）：
1. Windows 11 即時字幕視窗（LiveCaptions）— UIA 讀取，最準確
2. OCR 截圖 — 截取螢幕字幕區域，用 Windows.Media.Ocr
3. Audio fallback — 不在此模組，由主程式處理
"""
import threading
import time
import re
import ctypes
import ctypes.wintypes

import uiautomation as auto

# ── Windows 11 Live Captions UIA 讀取 ─────────────────────────────────────

# 即時字幕視窗的可能 class name（Win11 22H2+）
_LC_CLASSES = ["LiveCaptionsDesktopWindow", "LiveCaptionsDesktop"]
_LC_TITLE_HINTS = ["即時字幕", "Live Captions", "实时字幕"]


def find_live_captions_window():
    root = auto.GetRootControl()
    for w in root.GetChildren():
        cls  = w.ClassName or ""
        name = w.Name or ""
        if cls in _LC_CLASSES:
            return w
        if any(h in name for h in _LC_TITLE_HINTS):
            return w
    return None


def read_live_captions_text(window):
    """從即時字幕視窗取出所有文字，回傳合併字串。"""
    parts = []
    stack = window.GetChildren()
    visited = set()
    for _ in range(15):          # 最多 15 層
        next_stack = []
        for ctrl in stack:
            cid = id(ctrl)
            if cid in visited:
                continue
            visited.add(cid)
            try:
                name = (ctrl.Name or "").strip()
                if name and ctrl.ControlType == auto.ControlType.Text:
                    parts.append(name)
                next_stack.extend(ctrl.GetChildren())
            except Exception:
                pass
        stack = next_stack
    return " ".join(parts).strip()


# ── OCR 截圖方式（Windows.Media.Ocr）─────────────────────────────────────

def _try_ocr_import():
    try:
        import winrt.windows.media.ocr as wocr
        import winrt.windows.graphics.imaging as wgi
        import winrt.windows.storage.streams as wss
        from PIL import ImageGrab, Image
        import asyncio
        return True
    except ImportError:
        return False


_OCR_AVAILABLE = _try_ocr_import()


def ocr_region(x, y, w, h, lang_tag="zh-Hant"):
    """截取螢幕區域並用 Windows OCR 辨識，回傳文字。"""
    if not _OCR_AVAILABLE:
        return ""
    try:
        import winrt.windows.media.ocr as wocr
        import winrt.windows.graphics.imaging as wgi
        from PIL import ImageGrab
        import asyncio, io

        img = ImageGrab.grab(bbox=(x, y, x + w, y + h))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        async def _run():
            engine = wocr.OcrEngine.try_create_from_language(
                wocr.OcrEngine.get_available_recognizer_languages()[0]
            )
            # 用 SoftwareBitmap 載入
            import winrt.windows.storage.streams as wss
            mem = wss.InMemoryRandomAccessStream()
            writer = wss.DataWriter(mem)
            writer.write_bytes(list(png_bytes))
            await writer.store_async()
            mem.seek(0)
            decoder = await wgi.BitmapDecoder.create_async(mem)
            bmp = await decoder.get_software_bitmap_async()
            result = await engine.recognize_async(bmp)
            return result.text
        return asyncio.run(_run())
    except Exception:
        return ""


# ── 通用讀取器 ───────────────────────────────────────────────────────────

class CaptionReader:
    """
    自動偵測並讀取字幕，呼叫 on_new_line(text) 通知。
    strategy: 'auto' | 'livecaptions' | 'ocr'
    """

    def __init__(self, on_new_line, on_status, strategy="auto",
                 ocr_region_rect=None):
        self.on_new_line = on_new_line
        self.on_status   = on_status
        self.strategy    = strategy
        self.ocr_rect    = ocr_region_rect  # (x, y, w, h)
        self._running    = False
        self._seen_set   = set()
        self._last_text  = ""

    def start(self):
        self._running = True
        self._seen_set.clear()
        self._last_text = ""
        threading.Thread(target=self._loop, daemon=True).start()

    def stop(self):
        self._running = False

    # ── 主循環 ───────────────────────────────────────────────────────────
    def _loop(self):
        # 決定策略
        strat = self.strategy
        if strat == "auto":
            win = find_live_captions_window()
            if win:
                strat = "livecaptions"
                self.on_status("偵測到 Windows 即時字幕視窗，使用 Live Captions 模式")
            elif _OCR_AVAILABLE and self.ocr_rect:
                strat = "ocr"
                self.on_status("使用 OCR 截圖模式")
            else:
                self.on_status(
                    "未偵測到 Windows 即時字幕。\n"
                    "請按 Win+H 開啟即時字幕，或切換至「音訊辨識模式」。"
                )
                return

        if strat == "livecaptions":
            self._loop_livecaptions()
        elif strat == "ocr":
            self._loop_ocr()

    def _loop_livecaptions(self):
        self.on_status("即時字幕模式執行中...")
        while self._running:
            win = find_live_captions_window()
            if win is None:
                self.on_status("找不到即時字幕視窗，等待中（請按 Win+H 開啟）...")
                time.sleep(2)
                continue

            text = read_live_captions_text(win)
            if text and text != self._last_text:
                # 找出新增的部分（字幕通常是累積式更新）
                new_part = self._diff(self._last_text, text)
                self._last_text = text
                if new_part:
                    self._emit(new_part)
            time.sleep(0.4)

    def _loop_ocr(self):
        self.on_status("OCR 截圖模式執行中...")
        x, y, w, h = self.ocr_rect
        while self._running:
            text = ocr_region(x, y, w, h)
            if text and text != self._last_text:
                new_part = self._diff(self._last_text, text)
                self._last_text = text
                if new_part:
                    self._emit(new_part)
            time.sleep(0.6)

    # ── 輔助 ─────────────────────────────────────────────────────────────
    def _diff(self, old, new):
        """取出 new 相對於 old 的新增內容。"""
        if not old:
            return new.strip()
        if new.startswith(old):
            return new[len(old):].strip()
        # 找最長公共後綴起點
        for i in range(min(len(old), len(new)), 0, -1):
            if old.endswith(new[:i]):
                return new[i:].strip()
        return new.strip()

    def _emit(self, text):
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) < 2 or text in self._seen_set:
            return
        self._seen_set.add(text)
        if len(self._seen_set) > 500:          # 防記憶體膨脹
            self._seen_set = set(list(self._seen_set)[-200:])
        self.on_new_line(text)
