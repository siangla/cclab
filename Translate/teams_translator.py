"""
Teams / Google Meet 即時字幕翻譯器 v2
- 主要模式：讀取 Windows 11「即時字幕」(Live Captions) 視窗文字 → 翻譯
- 備用模式：音訊混音辨識（麥克風 + 系統輸出）

使用步驟（字幕模式）：
  1. Win+H  → 開啟 Windows 即時字幕
  2. 本程式選「字幕模式」→ 開始
  3. 翻譯欄位會即時顯示

需求: pip install uiautomation deep-translator customtkinter sounddevice faster-whisper
"""

import threading, time, queue, datetime, os, re
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import numpy as np
import sounddevice as sd
from deep_translator import GoogleTranslator
from caption_reader import CaptionReader, find_live_captions_window

try:
    import customtkinter as ctk
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    USE_CTK = True
except ImportError:
    USE_CTK = False

# ── 常數 ──────────────────────────────────────────────────────────────────
SAMPLE_RATE = 16000
CHUNK_SEC   = 4
SILENCE_RMS = 0.005

LANGUAGES = {
    "繁體中文": "zh-TW", "简体中文": "zh-CN", "English": "en",
    "日本語": "ja", "한국어": "ko", "Español": "es",
    "Français": "fr", "Deutsch": "de", "Português": "pt",
    "ภาษาไทย": "th", "Tiếng Việt": "vi",
}
WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"]
WHISPER_LANG = {k: None for k in ["自動偵測"]}
WHISPER_LANG.update({"繁體中文":"zh","简体中文":"zh","English":"en",
                      "日本語":"ja","한국어":"ko","Español":"es",
                      "Français":"fr","Deutsch":"de","Português":"pt",
                      "ภาษาไทย":"th","Tiếng Việt":"vi"})

# ── 音訊引擎 ──────────────────────────────────────────────────────────────
class AudioEngine:
    def __init__(self, on_result, on_status):
        self.on_result  = on_result
        self.on_status  = on_status
        self.audio_q    = queue.Queue()
        self.running    = False
        self._model     = None
        self._trans     = None
        self.src_lang   = None
        self._bufs      = {}
        self._lock      = threading.Lock()
        self.output_idx = None
        self.mic_idx    = None

    def load_model(self, name):
        sizes = {"tiny":"39MB","base":"74MB","small":"244MB","medium":"769MB","large-v3":"1.5GB"}
        sz = sizes.get(name, "")

        openai_cache = os.path.join(os.path.expanduser("~"), ".cache", "whisper", f"{name}.pt")
        faster_cache = self._find_faster_cache(name)

        if os.path.exists(openai_cache):
            self.on_status(f"載入 [{name}]（{sz}）至記憶體，請稍候…")
            import whisper as ow
            self._model = ow.load_model(name, download_root=os.path.dirname(openai_cache))
            self._backend = "openai"
            self.on_status(f"✓ Whisper [{name}] 就緒（本機快取）")
        elif faster_cache:
            self.on_status(f"載入 [{name}]（{sz}）至記憶體，請稍候…")
            from faster_whisper import WhisperModel
            self._model = WhisperModel(faster_cache, device="cpu", compute_type="int8")
            self._backend = "faster"
            self.on_status(f"✓ Whisper [{name}] 就緒（本機快取）")
        else:
            raise RuntimeError(
                f"找不到 {name} 模型的本機快取。\n"
                f"請先執行 download_model.py 下載模型。"
            )

    @staticmethod
    def _find_faster_cache(name: str) -> str | None:
        """找 faster-whisper 模型的 snapshot 目錄，回傳路徑或 None。"""
        hub = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")
        repo_dir = os.path.join(hub, f"models--Systran--faster-whisper-{name}", "snapshots")
        if not os.path.isdir(repo_dir):
            return None
        # 找最新的 snapshot
        snapshots = [os.path.join(repo_dir, d) for d in os.listdir(repo_dir)]
        for snap in snapshots:
            if os.path.exists(os.path.join(snap, "model.bin")):
                return snap
        return None

    def set_translator(self, src, tgt):
        self._trans = GoogleTranslator(source=src or "auto", target=tgt)

    def start(self, output_idx, mic_idx=None):
        self.running    = True
        self.output_idx = output_idx
        self.mic_idx    = mic_idx
        self._bufs      = {}
        self._ready     = set()   # 記錄哪些裝置已就緒，用來顯示合併狀態
        if output_idx is not None: self._bufs[output_idx] = []
        if mic_idx    is not None: self._bufs[mic_idx]    = []
        threading.Thread(target=self._worker, daemon=True).start()
        for idx in self._bufs:
            threading.Thread(target=self._record, args=(idx,), daemon=True).start()

    def stop(self):
        self.running = False

    def _record(self, dev_idx):
        chunk = SAMPLE_RATE * CHUNK_SEC
        is_primary = (dev_idx == self.output_idx) or \
                     (self.output_idx is None and dev_idx == self.mic_idx)

        def cb(indata, frames, t, status):
            mono = indata[:,0] if indata.ndim > 1 else indata.flatten()
            sr = int(sd.query_devices(dev_idx)["default_samplerate"])
            if sr != SAMPLE_RATE:
                n = int(len(mono) * SAMPLE_RATE / sr)
                mono = np.interp(np.linspace(0,len(mono),n), np.arange(len(mono)), mono).astype(np.float32)
            with self._lock:
                self._bufs[dev_idx].append(mono)
                if is_primary and sum(len(b) for b in self._bufs[dev_idx]) >= chunk:
                    self._push(chunk)

        try:
            sr = int(sd.query_devices(dev_idx)["default_samplerate"])
            with sd.InputStream(samplerate=sr, device=dev_idx, channels=1,
                                dtype="float32", callback=cb, blocksize=1024):
                # 標記此裝置就緒，更新合併狀態
                lbl = "輸出(Loopback)" if dev_idx == self.output_idx else "麥克風"
                self._ready.add(lbl)
                parts = sorted(self._ready)
                self.on_status(f"錄音中：{'、'.join(parts)} — 每 {CHUNK_SEC} 秒辨識一次")
                while self.running: time.sleep(0.1)
        except Exception as e:
            lbl = "輸出" if dev_idx == self.output_idx else "麥克風"
            self.on_status(f"⚠ {lbl} 裝置[{dev_idx}]錯誤: {e}")

    def _push(self, chunk):
        mixed = None
        for idx, buf in self._bufs.items():
            if not buf: continue
            arr = np.concatenate(buf)[:chunk]
            if len(arr) < chunk: arr = np.pad(arr, (0, chunk-len(arr)))
            mixed = arr if mixed is None else mixed + arr
            self._bufs[idx] = []
        if mixed is not None:
            pk = np.abs(mixed).max()
            if pk > 1.0: mixed /= pk
            self.audio_q.put(mixed.astype(np.float32))

    def _transcribe(self, audio):
        """統一辨識介面，自動切換 openai-whisper / faster-whisper。"""
        if self._backend == "openai":
            import whisper as ow
            audio = ow.pad_or_trim(audio)
            mel = ow.log_mel_spectrogram(audio).to(self._model.device)
            opts = ow.DecodingOptions(
                language=self.src_lang,
                fp16=False,
            )
            result = ow.decode(self._model, mel, opts)
            return result.text.strip()
        else:
            segs, _ = self._model.transcribe(audio, language=self.src_lang,
                                              beam_size=5, vad_filter=True)
            return " ".join(s.text for s in segs).strip()

    def _worker(self):
        while self.running or not self.audio_q.empty():
            try: audio = self.audio_q.get(timeout=1)
            except queue.Empty: continue
            if np.sqrt(np.mean(audio**2)) < SILENCE_RMS: continue
            try:
                text = self._transcribe(audio)
            except Exception as e:
                self.on_status(f"辨識錯誤: {e}"); continue
            if not text: continue
            try:    trans = self._trans.translate(text)
            except Exception as e: trans = f"[翻譯失敗: {e}]"
            self.on_result(text, trans, datetime.datetime.now().strftime("%H:%M:%S"))


# ── 音訊裝置工具 ──────────────────────────────────────────────────────────
def _audio_devices():
    return [(i, d["name"]) for i, d in enumerate(sd.query_devices())
            if d["max_input_channels"] > 0]

def _loopback_idx():
    keys = ["loopback","立體聲混音","stereo mix","what u hear"]
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0 and any(k in d["name"].lower() for k in keys):
            return i
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  GUI
# ══════════════════════════════════════════════════════════════════════════════
class App:
    def __init__(self):
        self.root = ctk.CTk() if USE_CTK else tk.Tk()
        self.root.title("Teams / Meet 即時翻譯 v2")
        self.root.geometry("980x740")

        self._translator = None
        self._caption_reader = None
        self._audio_engine   = AudioEngine(self._on_audio_result, self._on_status)
        self._devices = _audio_devices()
        self._log = []
        self._mode = tk.StringVar(value="caption")

        self._build()
        self._check_live_captions()   # 啟動時偵測一次

    # ── 建立 UI ──────────────────────────────────────────────────────────
    def _build(self):
        r = self.root

        # 模式列
        mf = tk.Frame(r)
        mf.pack(fill="x", padx=10, pady=(8,0))
        tk.Label(mf, text="模式：", font=("Arial",10,"bold")).pack(side="left", padx=6)
        for val, lbl in [("caption","字幕模式（Windows 即時字幕 Win+H）"),
                          ("audio",  "音訊辨識模式（備用）")]:
            tk.Radiobutton(mf, text=lbl, variable=self._mode, value=val,
                           command=self._on_mode_switch).pack(side="left", padx=8)

        # 分頁
        self.nb = ttk.Notebook(r)
        self.nb.pack(fill="x", padx=10, pady=6)

        # 頁1：字幕模式
        pg_cap = tk.Frame(self.nb)
        self.nb.add(pg_cap, text="  字幕設定  ")

        # 狀態燈
        self._lc_status_var = tk.StringVar(value="⬤ 未偵測")
        tk.Label(pg_cap, textvariable=self._lc_status_var,
                 font=("Arial",10)).grid(row=0, column=0, columnspan=3, padx=10, pady=6, sticky="w")

        tk.Button(pg_cap, text="Win+H 開啟即時字幕",
                  command=self._open_live_captions,
                  bg="#0078d4", fg="white",
                  font=("Arial",10,"bold")).grid(row=1, column=0, padx=10, pady=4, sticky="w")

        tk.Label(pg_cap, text="翻譯目標語言：").grid(row=1, column=1, padx=6)
        self.cap_tgt_var = tk.StringVar(value="繁體中文")
        ttk.Combobox(pg_cap, values=list(LANGUAGES.keys()),
                     textvariable=self.cap_tgt_var, state="readonly",
                     width=14).grid(row=1, column=2, padx=4)

        tk.Label(pg_cap, text="（字幕模式不需 Whisper，延遲約 0.5 秒）",
                 fg="gray").grid(row=2, column=0, columnspan=4, padx=10, sticky="w")

        # 頁2：音訊模式
        pg_aud = tk.Frame(self.nb)
        self.nb.add(pg_aud, text="  音訊設定  ")
        dev_names = ["（不使用）"] + [f"[{i}] {n}" for i,n in self._devices]

        for row, (lbl, attr) in enumerate([("輸出(Loopback)：","out_combo"),
                                            ("麥克風：","mic_combo")]):
            tk.Label(pg_aud, text=lbl).grid(row=row, column=0, padx=8, pady=4, sticky="w")
            cb = ttk.Combobox(pg_aud, values=dev_names, state="readonly", width=32)
            cb.grid(row=row, column=1, padx=4)
            setattr(self, attr, cb)

        self.mic_en = tk.BooleanVar(value=True)
        tk.Checkbutton(pg_aud, text="啟用麥克風", variable=self.mic_en).grid(row=1, column=2, padx=4)

        tk.Label(pg_aud, text="Whisper 模型：").grid(row=2, column=0, padx=8, pady=4, sticky="w")
        self.model_var = tk.StringVar(value="base")
        ttk.Combobox(pg_aud, values=WHISPER_MODELS, textvariable=self.model_var,
                     state="readonly", width=12).grid(row=2, column=1, sticky="w", padx=4)
        tk.Label(pg_aud, text="← 已設 HF 鏡像，medium/large 可下載",
                 fg="gray").grid(row=2, column=2, padx=4)

        tk.Label(pg_aud, text="辨識語言：").grid(row=3, column=0, padx=8, pady=4, sticky="w")
        self.src_var = tk.StringVar(value="自動偵測")
        ttk.Combobox(pg_aud, values=["自動偵測"]+list(LANGUAGES.keys()),
                     textvariable=self.src_var, state="readonly", width=14).grid(row=3, column=1, sticky="w", padx=4)
        tk.Label(pg_aud, text="翻譯成：").grid(row=3, column=2, padx=4)
        self.aud_tgt_var = tk.StringVar(value="繁體中文")
        ttk.Combobox(pg_aud, values=list(LANGUAGES.keys()),
                     textvariable=self.aud_tgt_var, state="readonly",
                     width=12).grid(row=3, column=3, padx=4)

        self._init_device_defaults()

        # 控制列
        bf = tk.Frame(r)
        bf.pack(fill="x", padx=10, pady=4)
        self.btn_start = tk.Button(bf, text="▶ 開始", fg="green",
                                   font=("Arial",11,"bold"), command=self._start)
        self.btn_start.pack(side="left", ipadx=12, ipady=4, padx=4)
        self.btn_stop = tk.Button(bf, text="■ 停止", fg="red",
                                  font=("Arial",11,"bold"), command=self._stop, state="disabled")
        self.btn_stop.pack(side="left", ipadx=12, ipady=4, padx=4)
        tk.Button(bf, text="清除", command=self._clear).pack(side="left", padx=4)
        tk.Button(bf, text="儲存逐字稿", command=self._save).pack(side="left", padx=4)

        # 逐字稿顯示
        pane = tk.PanedWindow(r, orient="vertical", sashrelief="raised")
        pane.pack(fill="both", expand=True, padx=10, pady=4)

        for label, attr in [(" 原文 ","orig_text"),(" 翻譯 ","trans_text")]:
            lf = tk.LabelFrame(r, text=label)
            pane.add(lf, height=210)
            setattr(self, attr, self._textbox(lf))

        # 狀態列
        sf = tk.Frame(r)
        sf.pack(fill="x", padx=10, pady=(0,6))
        self.status_var = tk.StringVar(value="就緒。請先按 Win+H 開啟 Windows 即時字幕。")
        tk.Label(sf, textvariable=self.status_var, anchor="w",
                 wraplength=900, font=("Arial",9)).pack(fill="x")

    def _textbox(self, parent):
        f = tk.Frame(parent)
        f.pack(fill="both", expand=True, padx=4, pady=4)
        sb = tk.Scrollbar(f); sb.pack(side="right", fill="y")
        t = tk.Text(f, wrap="word", yscrollcommand=sb.set,
                    font=("Arial",12), relief="flat", state="disabled")
        t.pack(fill="both", expand=True)
        sb.config(command=t.yview)
        return t

    def _init_device_defaults(self):
        dev_names = ["（不使用）"] + [f"[{i}] {n}" for i,n in self._devices]
        lb = _loopback_idx()
        out_sel, mic_sel = 0, 0
        for k, (di, _) in enumerate(self._devices):
            if di == lb and out_sel == 0:       out_sel = k + 1
            if di != lb and mic_sel == 0:       mic_sel = k + 1
        self.out_combo.current(out_sel or (1 if self._devices else 0))
        self.mic_combo.current(mic_sel or (1 if self._devices else 0))

    def _on_mode_switch(self):
        self.nb.select(0 if self._mode.get() == "caption" else 1)

    # ── Windows 即時字幕偵測 ──────────────────────────────────────────────
    def _check_live_captions(self):
        """非同步檢查即時字幕是否開啟，更新狀態燈。"""
        def _check():
            while True:
                win = find_live_captions_window()
                if win:
                    self.root.after(0, lambda: self._lc_status_var.set(
                        "⬤ 即時字幕已開啟（就緒）"))
                else:
                    self.root.after(0, lambda: self._lc_status_var.set(
                        "⬤ 即時字幕未開啟 — 請按下方按鈕或 Win+H"))
                time.sleep(3)
        threading.Thread(target=_check, daemon=True).start()

    def _open_live_captions(self):
        """模擬按下 Win+H 開啟即時字幕。"""
        import ctypes
        VK_LWIN, VK_H = 0x5B, 0x48
        KEYEVENTF_KEYUP = 0x0002
        ctypes.windll.user32.keybd_event(VK_LWIN, 0, 0, 0)
        ctypes.windll.user32.keybd_event(VK_H, 0, 0, 0)
        ctypes.windll.user32.keybd_event(VK_H, 0, KEYEVENTF_KEYUP, 0)
        ctypes.windll.user32.keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0)
        self._on_status("已送出 Win+H，等待即時字幕視窗...")

    # ── 控制 ─────────────────────────────────────────────────────────────
    def _start(self):
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")

        if self._mode.get() == "caption":
            tgt = LANGUAGES[self.cap_tgt_var.get()]
            self._translator = GoogleTranslator(source="auto", target=tgt)
            self._caption_reader = CaptionReader(
                on_new_line=self._on_caption,
                on_status=self._on_status,
                strategy="auto",
            )
            self._caption_reader.start()
        else:
            self._start_audio()

    def _start_audio(self):
        def _idx(combo):
            sel = combo.current()
            return None if sel <= 0 else self._devices[sel-1][0]
        out = _idx(self.out_combo)
        mic = _idx(self.mic_combo) if self.mic_en.get() else None
        if out is None and mic is None:
            messagebox.showerror("錯誤","請選擇至少一個音訊來源")
            self.btn_start.config(state="normal"); self.btn_stop.config(state="disabled")
            return
        src_lbl  = self.src_var.get()
        tgt_code = LANGUAGES[self.aud_tgt_var.get()]
        model    = self.model_var.get()

        def init():
            try:
                self._audio_engine.src_lang = WHISPER_LANG.get(src_lbl)
                self._audio_engine.load_model(model)
                self._audio_engine.set_translator(
                    LANGUAGES.get(src_lbl) if src_lbl != "自動偵測" else None, tgt_code)
                primary = out if out is not None else mic
                secondary = mic if out is not None else None
                self._audio_engine.start(primary, secondary)
            except Exception as e:
                self._on_status(f"啟動失敗: {e}")
                self.root.after(0, lambda: self.btn_start.config(state="normal"))
                self.root.after(0, lambda: self.btn_stop.config(state="disabled"))

        threading.Thread(target=init, daemon=True).start()

    def _stop(self):
        if self._caption_reader:
            self._caption_reader.stop()
            self._caption_reader = None
        self._audio_engine.stop()
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self._on_status("已停止")

    # ── Callbacks ─────────────────────────────────────────────────────────
    def _on_caption(self, text):
        try:
            translated = self._translator.translate(text) if self._translator else text
        except Exception as e:
            translated = f"[翻譯失敗: {e}]"
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self._log.append((ts, text, translated))
        self.root.after(0, lambda: self._append(self.orig_text,  f"[{ts}] {text}\n"))
        self.root.after(0, lambda: self._append(self.trans_text, f"[{ts}] {translated}\n"))

    def _on_audio_result(self, orig, trans, ts):
        self._log.append((ts, orig, trans))
        self.root.after(0, lambda: self._append(self.orig_text,  f"[{ts}] {orig}\n"))
        self.root.after(0, lambda: self._append(self.trans_text, f"[{ts}] {trans}\n"))

    def _on_status(self, msg):
        self.root.after(0, lambda: self.status_var.set(msg))

    def _append(self, w, text):
        w.config(state="normal")
        w.insert("end", text)
        w.see("end")
        w.config(state="disabled")

    # ── 儲存 / 清除 ───────────────────────────────────────────────────────
    def _save(self):
        if not self._log:
            messagebox.showinfo("提示","尚無內容"); return
        path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("文字檔","*.txt"),("所有檔案","*.*")],
            initialfile=f"transcript_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
        if not path: return
        with open(path,"w",encoding="utf-8") as f:
            f.write("會議逐字稿\n"+"="*60+"\n\n")
            for ts,orig,trans in self._log:
                f.write(f"[{ts}]\n原文: {orig}\n翻譯: {trans}\n\n")
        messagebox.showinfo("完成",f"已儲存：{path}")

    def _clear(self):
        self._log.clear()
        for w in (self.orig_text, self.trans_text):
            w.config(state="normal"); w.delete("1.0","end"); w.config(state="disabled")

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    App().run()
