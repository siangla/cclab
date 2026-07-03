"""
Whisper 模型下載工具 v2
從 OpenAI 官方 Azure CDN 下載（不需連 HuggingFace），支援斷點續傳
"""
import os, threading, hashlib
import tkinter as tk
from tkinter import ttk, messagebox
import urllib.request

# OpenAI 官方模型 URL（Azure CDN，全球可連）
MODELS = {
    "tiny":     {
        "url":  "https://openaipublic.azureedge.net/main/whisper/models/"
                "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt",
        "sha":  "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9",
        "size": "39 MB",
    },
    "base":     {
        "url":  "https://openaipublic.azureedge.net/main/whisper/models/"
                "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt",
        "sha":  "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e",
        "size": "74 MB",
    },
    "small":    {
        "url":  "https://openaipublic.azureedge.net/main/whisper/models/"
                "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt",
        "sha":  "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794",
        "size": "244 MB",
    },
    "medium":   {
        "url":  "https://openaipublic.azureedge.net/main/whisper/models/"
                "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt",
        "sha":  "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1",
        "size": "769 MB",
    },
    "large-v3": {
        "url":  "https://openaipublic.azureedge.net/main/whisper/models/"
                "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb/large-v3.pt",
        "sha":  "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb",
        "size": "1.55 GB",
    },
}

# openai-whisper 預設快取目錄
CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "whisper")


def model_path(name: str) -> str:
    return os.path.join(CACHE_DIR, f"{name}.pt")


def verify_sha(path: str, expected: str) -> bool:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest() == expected


def download_file(url: str, dest: str, progress_cb=None) -> bool:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    resume = os.path.getsize(tmp) if os.path.exists(tmp) else 0

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Range": f"bytes={resume}-",
        })
        with urllib.request.urlopen(req, timeout=60) as resp:
            cr = resp.headers.get("Content-Range", "")
            total = int(cr.split("/")[-1]) if "/" in cr else \
                    (int(resp.headers.get("Content-Length", 0)) + resume)

            mode = "ab" if resume else "wb"
            done = resume
            with open(tmp, mode) as f:
                while True:
                    chunk = resp.read(131072)   # 128 KB
                    if not chunk:
                        break
                    f.write(chunk)
                    done += len(chunk)
                    if progress_cb and total:
                        progress_cb(done, total)

        os.replace(tmp, dest)
        return True
    except Exception as e:
        if progress_cb:
            progress_cb(0, 0, error=str(e))
        return False


FASTER_HUB = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")


def _find_faster_snapshot(name):
    repo = os.path.join(FASTER_HUB, f"models--Systran--faster-whisper-{name}", "snapshots")
    if not os.path.isdir(repo):
        return None
    for d in os.listdir(repo):
        snap = os.path.join(repo, d)
        if os.path.exists(os.path.join(snap, "model.bin")):
            return snap
    return None


class DownloadApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Whisper 模型下載工具（Azure CDN）")
        self.root.geometry("780x430")
        self.root.resizable(False, False)
        self._build()

    @staticmethod
    def _cache_status(name):
        """回傳 (已快取bool, 路徑字串)"""
        p = model_path(name)
        if os.path.exists(p):
            return True, p
        snap = _find_faster_snapshot(name)
        if snap:
            return True, snap
        return False, ""

    def _build(self):
        r = self.root
        tk.Label(r, text="選擇要下載的模型（來源：OpenAI Azure CDN，全球可連）",
                 font=("Arial", 10, "bold")).pack(pady=(12, 6))

        self.model_var = tk.StringVar(value="medium")
        for name, info in MODELS.items():
            cached, path = self._cache_status(name)
            if cached:
                status = f"  ✓ 已下載  →  {path}"
                color = "#007700"
            else:
                status = "  （未下載）"
                color = "#555555"
            tk.Radiobutton(
                r, font=("Consolas", 10), fg=color,
                text=f"{name:<12} {info['size']:<10}{status}",
                variable=self.model_var, value=name,
            ).pack(anchor="w", padx=30)

        self.btn = tk.Button(
            r, text="開始下載", bg="#0078d4", fg="white",
            font=("Arial", 11, "bold"), command=self._start,
        )
        self.btn.pack(pady=10, ipadx=16, ipady=4)

        # 進度條
        self.pct_var = tk.StringVar(value="")
        tk.Label(r, textvariable=self.pct_var).pack()
        self.bar = ttk.Progressbar(r, length=580, mode="determinate")
        self.bar.pack(padx=20, pady=4)

        self.status_var = tk.StringVar(value="選擇模型後點「開始下載」")
        tk.Label(r, textvariable=self.status_var, wraplength=600,
                 fg="gray", font=("Arial", 9)).pack(pady=4)

        tk.Label(r,
                 text="下載完成後，主程式的「音訊辨識模式」即可選用該模型。\n"
                      "斷點續傳：中途關閉後重新下載會從斷點繼續。",
                 fg="#555", font=("Arial", 9)).pack(pady=2)

    def _start(self):
        self.btn.config(state="disabled")
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        name = self.model_var.get()
        info = MODELS[name]
        dest = model_path(name)

        # 已存在且 SHA 正確則跳過
        if os.path.exists(dest):
            self._set_status("驗證既有檔案...")
            if verify_sha(dest, info["sha"]):
                self._set_status(f"✓ {name} 已存在且完整，無需重新下載")
                self.root.after(0, lambda: messagebox.showinfo("完成", f"{name} 已就緒"))
                self.root.after(0, lambda: self.btn.config(state="normal"))
                return
            else:
                self._set_status("檔案損毀，重新下載...")
                os.remove(dest)

        self._set_status(f"下載 {name}.pt（{info['size']}）從 Azure CDN...")

        def cb(done, total, error=None):
            if error:
                self._set_status(f"下載失敗：{error}")
                return
            if total:
                pct = done / total * 100
                mb_d = done / 1024 / 1024
                mb_t = total / 1024 / 1024
                self.root.after(0, lambda p=pct: self.bar.config(value=p))
                self.root.after(0, lambda: self.pct_var.set(
                    f"{mb_d:.1f} / {mb_t:.1f} MB  ({pct:.1f}%)"))

        ok = download_file(info["url"], dest, cb)
        if not ok:
            self.root.after(0, lambda: self.btn.config(state="normal"))
            return

        # 驗證 SHA256
        self._set_status("驗證檔案完整性...")
        if verify_sha(dest, info["sha"]):
            self._set_status(f"✓ {name} 下載完成且驗證通過！")
            self.root.after(0, lambda: messagebox.showinfo(
                "完成", f"{name} 已下載完成！\n存放：{dest}\n\n"
                        "請在主程式「音訊設定」選擇此模型。"))
        else:
            self._set_status("⚠ 檔案驗證失敗，請重試")
            os.remove(dest)

        self.root.after(0, lambda: self.btn.config(state="normal"))

    def _set_status(self, msg):
        self.root.after(0, lambda: self.status_var.set(msg))

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    DownloadApp().run()
