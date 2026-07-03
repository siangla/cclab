"""
Meeting Transcript & Translator
捕捉系統音訊（Teams / Google Meet 等），即時轉逐字稿並翻譯。
需求: faster-whisper, sounddevice, deep-translator, customtkinter
"""

import threading
import queue
import time
import os
import datetime
import numpy as np
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

try:
    import customtkinter as ctk
    USE_CTK = True
except ImportError:
    USE_CTK = False

import sounddevice as sd
from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator

# ── 常數 ──────────────────────────────────────────────────────────────────────
SAMPLE_RATE = 16000
CHUNK_SECONDS = 5          # 每次辨識的音訊片段長度（秒）
SILENCE_THRESHOLD = 0.005  # 靜音門檻（RMS），低於此值略過辨識

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"]

LANGUAGES = {
    "繁體中文": "zh-TW",
    "简体中文": "zh-CN",
    "English": "en",
    "日本語": "ja",
    "한국어": "ko",
    "Español": "es",
    "Français": "fr",
    "Deutsch": "de",
    "Português": "pt",
    "Italiano": "it",
    "Русский": "ru",
    "ภาษาไทย": "th",
    "Tiếng Việt": "vi",
}

# Whisper 支援的語言（用於辨識來源語言，None=自動偵測）
WHISPER_LANG_MAP = {
    "繁體中文": "zh", "简体中文": "zh", "English": "en", "日本語": "ja",
    "한국어": "ko", "Español": "es", "Français": "fr", "Deutsch": "de",
    "Português": "pt", "Italiano": "it", "Русский": "ru",
    "ภาษาไทย": "th", "Tiếng Việt": "vi", "自動偵測": None,
}


# ── 音訊擷取（支援麥克風 & WASAPI Loopback）────────────────────────────────
def list_audio_devices():
    """列出所有可用音訊裝置，標示 loopback 裝置。"""
    devices = sd.query_devices()
    result = []
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            name = d["name"]
            tag = " [LOOPBACK]" if "loopback" in name.lower() or "立體聲混音" in name or "Stereo Mix" in name.lower() else ""
            result.append((i, f"{name}{tag}", d["default_samplerate"]))
    return result


def get_loopback_device():
    """嘗試自動找到 WASAPI Loopback 裝置。"""
    devices = sd.query_devices()
    keywords = ["loopback", "立體聲混音", "stereo mix", "what u hear", "wave out mix"]
    for i, d in enumerate(devices):
        if d["max_input_channels"] > 0:
            if any(k in d["name"].lower() for k in keywords):
                return i
    return None


# ── 核心處理執行緒 ─────────────────────────────────────────────────────────
class TranscriptEngine:
    def __init__(self, on_result, on_status):
        self.on_result = on_result   # callback(original, translated, timestamp)
        self.on_status = on_status   # callback(msg)
        self.audio_queue = queue.Queue()
        self.running = False
        self._stream = None
        self._model = None
        self._translator = None
        self.model_name = "base"
        self.src_lang = None          # None = Whisper 自動偵測
        self.tgt_lang = "zh-TW"
        self.device_idx = None

    def load_model(self, model_name):
        self.on_status(f"載入 Whisper 模型 [{model_name}]，首次使用需下載...")
        self.model_name = model_name
        self._model = WhisperModel(model_name, device="cpu", compute_type="int8")
        self.on_status(f"模型 [{model_name}] 載入完成")

    def set_translator(self, src_code, tgt_code):
        # deep-translator auto 用 'auto'
        src = src_code if src_code else "auto"
        self._translator = GoogleTranslator(source=src, target=tgt_code)
        self.tgt_lang = tgt_code

    def start(self, output_idx, mic_idx=None):
        """
        output_idx: 系統輸出 loopback 裝置（必填）
        mic_idx:    麥克風裝置（None = 不錄麥克風）
        兩路音訊在同一時間軸上混合後送辨識。
        """
        if self.running:
            return
        self.output_idx = output_idx
        self.mic_idx = mic_idx
        self.running = True

        # 每個裝置各有自己的短 buffer；用 lock 保護混合操作
        self._mix_lock = threading.Lock()
        # key=device_idx, value=list of np arrays
        self._dev_buffers = {}
        if output_idx is not None:
            self._dev_buffers[output_idx] = []
        if mic_idx is not None:
            self._dev_buffers[mic_idx] = []

        self._worker_thread = threading.Thread(target=self._worker, daemon=True)
        self._worker_thread.start()

        # 為每個有效裝置啟動一條錄音執行緒
        for idx in list(self._dev_buffers.keys()):
            t = threading.Thread(target=self._record_device, args=(idx,), daemon=True)
            t.start()

    def stop(self):
        self.running = False

    # ── 單一裝置錄音執行緒 ────────────────────────────────────────────────
    def _record_device(self, dev_idx):
        """持續錄製指定裝置，每 CHUNK_SECONDS 秒將混合好的音訊推入佇列一次。"""
        chunk_samples = SAMPLE_RATE * CHUNK_SECONDS
        is_primary = (dev_idx == self.output_idx)  # output 負責觸發 push

        def callback(indata, frames, time_info, status):
            mono = indata[:, 0] if indata.ndim > 1 else indata.flatten()
            # 重採樣到 16kHz
            dev_sr = int(sd.query_devices(dev_idx)["default_samplerate"])
            if dev_sr != SAMPLE_RATE:
                ratio = SAMPLE_RATE / dev_sr
                new_len = int(len(mono) * ratio)
                mono = np.interp(
                    np.linspace(0, len(mono), new_len),
                    np.arange(len(mono)),
                    mono,
                ).astype(np.float32)

            with self._mix_lock:
                self._dev_buffers[dev_idx].append(mono)
                # 只讓 primary 裝置負責判斷「是否湊滿一個 chunk」
                if is_primary:
                    total = sum(len(b) for b in self._dev_buffers[dev_idx])
                    if total >= chunk_samples:
                        self._push_mixed_chunk(chunk_samples)

        try:
            dev_info = sd.query_devices(dev_idx)
            sr = int(dev_info["default_samplerate"])
            label = "輸出(Loopback)" if dev_idx == self.output_idx else "麥克風"
            self.on_status(f"錄音中（{label} 裝置[{dev_idx}]）...")
            with sd.InputStream(
                samplerate=sr,
                device=dev_idx,
                channels=1,
                dtype="float32",
                callback=callback,
                blocksize=1024,
            ):
                while self.running:
                    time.sleep(0.1)
        except Exception as e:
            self.on_status(f"裝置[{dev_idx}] 錯誤: {e}")

    def _push_mixed_chunk(self, chunk_samples):
        """將所有裝置的 buffer 混合成一段音訊推入辨識佇列（需在 _mix_lock 內呼叫）。"""
        mixed = None
        for idx, buf in self._dev_buffers.items():
            if not buf:
                continue
            arr = np.concatenate(buf)[:chunk_samples]
            # 補零到 chunk_samples（若某路資料不足）
            if len(arr) < chunk_samples:
                arr = np.pad(arr, (0, chunk_samples - len(arr)))
            mixed = arr if mixed is None else mixed + arr
            self._dev_buffers[idx] = []  # 清空

        if mixed is not None:
            # 防止混合後振幅超出 [-1, 1]
            peak = np.abs(mixed).max()
            if peak > 1.0:
                mixed = mixed / peak
            self.audio_queue.put(mixed.astype(np.float32))

    def _worker(self):
        while self.running or not self.audio_queue.empty():
            try:
                audio = self.audio_queue.get(timeout=1)
            except queue.Empty:
                continue

            # 靜音偵測
            rms = float(np.sqrt(np.mean(audio ** 2)))
            if rms < SILENCE_THRESHOLD:
                continue

            # 重採樣至 16kHz（Whisper 需求）
            if self.device_idx is not None:
                dev_sr = int(sd.query_devices(self.device_idx)["default_samplerate"])
                if dev_sr != SAMPLE_RATE:
                    ratio = SAMPLE_RATE / dev_sr
                    new_len = int(len(audio) * ratio)
                    audio = np.interp(
                        np.linspace(0, len(audio), new_len),
                        np.arange(len(audio)),
                        audio,
                    ).astype(np.float32)

            # 語音辨識
            try:
                segments, info = self._model.transcribe(
                    audio,
                    language=self.src_lang,
                    beam_size=5,
                    vad_filter=True,
                )
                original = " ".join(s.text for s in segments).strip()
            except Exception as e:
                self.on_status(f"辨識錯誤: {e}")
                continue

            if not original:
                continue

            # 翻譯
            translated = ""
            try:
                translated = self._translator.translate(original)
            except Exception as e:
                translated = f"[翻譯失敗: {e}]"

            ts = datetime.datetime.now().strftime("%H:%M:%S")
            self.on_result(original, translated, ts)


# ── GUI ────────────────────────────────────────────────────────────────────────
class App:
    def __init__(self):
        if USE_CTK:
            ctk.set_appearance_mode("dark")
            ctk.set_default_color_theme("blue")
            self.root = ctk.CTk()
        else:
            self.root = tk.Tk()

        self.root.title("會議逐字稿翻譯器")
        self.root.geometry("900x680")
        self.engine = TranscriptEngine(
            on_result=self._on_result,
            on_status=self._on_status,
        )
        self.transcript_lines = []
        self._build_ui()

    # ── UI 建構 ─────────────────────────────────────────────────────────────
    def _build_ui(self):
        r = self.root

        # ── 頂部控制列 ──
        ctrl = self._frame(r)
        ctrl.pack(fill="x", padx=10, pady=8)

        # 輸出裝置（Loopback）
        self._label(ctrl, "輸出裝置(Loopback):").grid(row=0, column=0, sticky="w", padx=4)
        self.output_var = tk.StringVar()
        self.output_combo = self._combo(ctrl, textvariable=self.output_var, width=28)
        self.output_combo.grid(row=0, column=1, padx=4)

        # 麥克風裝置
        self._label(ctrl, "麥克風:").grid(row=1, column=0, sticky="w", padx=4, pady=2)
        self.mic_var = tk.StringVar()
        self.mic_combo = self._combo(ctrl, textvariable=self.mic_var, width=28)
        self.mic_combo.grid(row=1, column=1, padx=4)
        self.mic_enable_var = tk.BooleanVar(value=True)
        tk.Checkbutton(ctrl, text="啟用麥克風", variable=self.mic_enable_var).grid(row=1, column=2, padx=4)

        self._btn(ctrl, "重新整理", self._refresh_devices).grid(row=0, column=2, padx=4)

        # Whisper 模型
        self._label(ctrl, "Whisper 模型:").grid(row=0, column=3, sticky="w", padx=4)
        self.model_var = tk.StringVar(value="base")
        self._combo(ctrl, values=WHISPER_MODELS, textvariable=self.model_var, width=10).grid(row=0, column=4, padx=4)

        # 來源語言
        self._label(ctrl, "辨識語言:").grid(row=2, column=0, sticky="w", padx=4, pady=4)
        self.src_lang_var = tk.StringVar(value="自動偵測")
        src_options = ["自動偵測"] + list(LANGUAGES.keys())
        self._combo(ctrl, values=src_options, textvariable=self.src_lang_var, width=14).grid(row=2, column=1, padx=4)

        # 目標語言
        self._label(ctrl, "翻譯成:").grid(row=2, column=3, sticky="w", padx=4)
        self.tgt_lang_var = tk.StringVar(value="繁體中文")
        self._combo(ctrl, values=list(LANGUAGES.keys()), textvariable=self.tgt_lang_var, width=14).grid(row=2, column=4, padx=4)

        # 開始 / 停止
        self.btn_start = self._btn(ctrl, "▶ 開始", self._start, fg="green")
        self.btn_start.grid(row=0, column=5, rowspan=3, padx=8, ipadx=8, ipady=4)
        self.btn_stop = self._btn(ctrl, "■ 停止", self._stop, fg="red", state="disabled")
        self.btn_stop.grid(row=0, column=6, rowspan=3, padx=4, ipadx=8, ipady=4)

        # ── 逐字稿區 ──
        pane = tk.PanedWindow(r, orient="vertical", sashrelief="raised")
        pane.pack(fill="both", expand=True, padx=10, pady=4)

        orig_frame = self._frame(r, label=" 原文逐字稿 ")
        pane.add(orig_frame, height=200)
        self.orig_text = self._text(orig_frame)

        trans_frame = self._frame(r, label=" 翻譯 ")
        pane.add(trans_frame, height=200)
        self.trans_text = self._text(trans_frame)

        # ── 狀態列 ──
        bot = self._frame(r)
        bot.pack(fill="x", padx=10, pady=4)
        self.status_var = tk.StringVar(value="就緒。請選擇裝置後點擊「開始」。")
        tk.Label(bot, textvariable=self.status_var, anchor="w").pack(side="left", fill="x", expand=True)
        self._btn(bot, "儲存逐字稿", self._save).pack(side="right", padx=4)
        self._btn(bot, "清除", self._clear).pack(side="right", padx=4)

        self._refresh_devices()

    # ── UI 輔助 ─────────────────────────────────────────────────────────────
    def _frame(self, parent, label=None):
        if label:
            return tk.LabelFrame(parent, text=label, font=("Arial", 9))
        return tk.Frame(parent)

    def _label(self, parent, text):
        return tk.Label(parent, text=text)

    def _combo(self, parent, **kw):
        return ttk.Combobox(parent, state="readonly", **kw)

    def _btn(self, parent, text, cmd, fg=None, state="normal"):
        b = tk.Button(parent, text=text, command=cmd, state=state)
        if fg:
            b.config(fg=fg)
        return b

    def _text(self, parent):
        frame = tk.Frame(parent)
        frame.pack(fill="both", expand=True, padx=4, pady=4)
        sb = tk.Scrollbar(frame)
        sb.pack(side="right", fill="y")
        t = tk.Text(frame, wrap="word", yscrollcommand=sb.set, font=("Arial", 11), relief="flat")
        t.pack(fill="both", expand=True)
        sb.config(command=t.yview)
        return t

    # ── 裝置列表 ────────────────────────────────────────────────────────────
    def _refresh_devices(self):
        devs = list_audio_devices()
        self._devices = devs
        all_names = [f"[{i}] {name}" for i, name, _ in devs]

        # 輸出下拉：加上「不使用」選項
        output_opts = ["（不錄輸出）"] + all_names
        self.output_combo.config(values=output_opts)
        mic_opts = ["（不錄麥克風）"] + all_names
        self.mic_combo.config(values=mic_opts)

        # 預設：輸出選 loopback，麥克風選第一個非 loopback 輸入
        loopback = get_loopback_device()
        loopback_list_idx = None
        first_mic_list_idx = None

        for list_idx, (dev_i, name, _) in enumerate(devs):
            if dev_i == loopback and loopback_list_idx is None:
                loopback_list_idx = list_idx
            is_loopback_dev = loopback is not None and dev_i == loopback
            if not is_loopback_dev and first_mic_list_idx is None:
                first_mic_list_idx = list_idx

        if loopback_list_idx is not None:
            self.output_combo.current(loopback_list_idx + 1)   # +1 因為第0項是「不錄輸出」
        elif all_names:
            self.output_combo.current(1)
        else:
            self.output_combo.current(0)

        if first_mic_list_idx is not None:
            self.mic_combo.current(first_mic_list_idx + 1)
        elif all_names:
            self.mic_combo.current(1)
        else:
            self.mic_combo.current(0)

    def _get_device_idx(self, combo):
        """從下拉取得裝置 index，第0項（不錄）回傳 None。"""
        sel = combo.current()
        if sel <= 0:
            return None
        return self._devices[sel - 1][0]  # -1 因為第0項是「不錄」

    # ── 控制 ────────────────────────────────────────────────────────────────
    def _start(self):
        output_idx = self._get_device_idx(self.output_combo)
        mic_idx = self._get_device_idx(self.mic_combo) if self.mic_enable_var.get() else None

        if output_idx is None and mic_idx is None:
            messagebox.showerror("錯誤", "請至少選擇一個音訊來源（輸出或麥克風）")
            return

        model_name = self.model_var.get()
        src_label = self.src_lang_var.get()
        tgt_label = self.tgt_lang_var.get()

        src_whisper = WHISPER_LANG_MAP.get(src_label)
        src_translate = LANGUAGES.get(src_label, "auto") if src_label != "自動偵測" else "auto"
        tgt_code = LANGUAGES[tgt_label]

        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")

        sources = []
        if output_idx is not None:
            sources.append("輸出(Loopback)")
        if mic_idx is not None:
            sources.append("麥克風")
        self._on_status(f"啟動中... 音訊來源: {' + '.join(sources)}")

        def init():
            try:
                self.engine.load_model(model_name)
                self.engine.src_lang = src_whisper
                self.engine.set_translator(src_translate if src_translate != "auto" else None, tgt_code)
                # output_idx 為 primary；若只有麥克風則以麥克風為 primary
                primary = output_idx if output_idx is not None else mic_idx
                secondary = mic_idx if output_idx is not None else None
                self.engine.start(primary, secondary)
            except Exception as e:
                self._on_status(f"啟動失敗: {e}")
                self.root.after(0, lambda: self.btn_start.config(state="normal"))
                self.root.after(0, lambda: self.btn_stop.config(state="disabled"))

        threading.Thread(target=init, daemon=True).start()

    def _stop(self):
        self.engine.stop()
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self._on_status("已停止")

    # ── 回呼 ────────────────────────────────────────────────────────────────
    def _on_result(self, original, translated, ts):
        self.transcript_lines.append((ts, original, translated))
        self.root.after(0, lambda: self._append_text(self.orig_text, f"[{ts}] {original}\n"))
        self.root.after(0, lambda: self._append_text(self.trans_text, f"[{ts}] {translated}\n"))

    def _on_status(self, msg):
        self.root.after(0, lambda: self.status_var.set(msg))

    def _append_text(self, widget, text):
        widget.config(state="normal")
        widget.insert("end", text)
        widget.see("end")
        widget.config(state="disabled")

    # ── 儲存 / 清除 ─────────────────────────────────────────────────────────
    def _save(self):
        if not self.transcript_lines:
            messagebox.showinfo("提示", "尚無逐字稿可儲存")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("文字檔", "*.txt"), ("所有檔案", "*.*")],
            initialfile=f"transcript_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
        )
        if not path:
            return
        with open(path, "w", encoding="utf-8") as f:
            f.write("會議逐字稿\n")
            f.write("=" * 60 + "\n\n")
            for ts, orig, trans in self.transcript_lines:
                f.write(f"[{ts}]\n原文: {orig}\n翻譯: {trans}\n\n")
        messagebox.showinfo("完成", f"已儲存至:\n{path}")

    def _clear(self):
        self.transcript_lines.clear()
        for w in (self.orig_text, self.trans_text):
            w.config(state="normal")
            w.delete("1.0", "end")
            w.config(state="disabled")

    def run(self):
        self.root.mainloop()


# ── 入口 ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = App()
    app.run()
