# -*- coding: utf-8 -*-
"""
喝水提醒 mini 版  ──  無水滴、小視窗
需求：Python 3 + tkinter
執行：python water_buddy_mini.py
"""

import json, math, os, random, sys
from datetime import date
import tkinter as tk
from tkinter import font as tkfont

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".water_buddy_mini.json")
DEFAULT_CFG = {"interval_min": 30, "goal_cups": 8,
               "topmost": False, "date": "", "cups": 0}

def load_cfg():
    cfg = dict(DEFAULT_CFG)
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f: cfg.update(json.load(f))
    except Exception: pass
    today = date.today().isoformat()
    if cfg.get("date") != today: cfg["date"] = today; cfg["cups"] = 0
    return cfg

def save_cfg(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception: pass

REMIND = ["時間到囉～乾一杯水吧！", "你的細胞正在敲碗要水 ✦",
          "咕嚕咕嚕～補水時間到！", "再不喝水我要乾掉了啦",
          "工作再忙，也要喝一杯水！", "老闆不會幫你喝，自己喝喔！"]
IDLE   = ["我在這陪你工作～", "今天也要好好喝水喔！",
          "保持水嫩的祕訣就是……喝水！", "嗨，今天補水達標了嗎？",
          "每一杯水都是對自己的愛 ✦"]
PRAISE = ["讚啦！再接再厲 ✦", "好棒！身體會謝謝你～",
          "+1 杯！繼續保持！", "乾杯！(用水)"]
DONE   = ["今日目標達成！✦", "滿杯！你今天超棒的！", "完美達標 ✦"]

BG      = "#f0f4f8"
CARD    = "#ffffff"
BORDER  = "#c8dfe9"
INK     = "#3d5a6b"
INK_DIM = "#8aacbc"
PILL_A  = "#5bb8d4"
PILL_B  = "#daeef6"
DOT_ON  = "#5bb8d4"
DOT_OFF = "#cce4ef"
RESET_BG = "#fde8e8"
RESET_FG = "#c0544a"

def lerp(c1, c2, t):
    def h(c): return tuple(int(c.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
    r1,g1,b1=h(c1); r2,g2,b2=h(c2)
    return f"#{int(r1+(r2-r1)*t):02x}{int(g1+(g2-g1)*t):02x}{int(b1+(b2-b1)*t):02x}"

def pick_font(size, weight="normal"):
    for nm in ("Microsoft JhengHei","PingFang TC","Noto Sans CJK TC","Heiti TC","DejaVu Sans"):
        try:
            if nm in tkfont.families():
                return tkfont.Font(family=nm, size=size, weight=weight)
        except Exception: pass
    return tkfont.Font(size=size, weight=weight)


class WaterMini:
    W, H = 260, 310

    def __init__(self, root):
        self.root = root
        self.cfg = load_cfg()
        root.title("喝水提醒")
        root.configure(bg=BG)
        root.geometry(f"{self.W}x{self.H}")
        root.minsize(self.W, self.H)
        root.resizable(False, False)
        try: root.attributes("-topmost", bool(self.cfg["topmost"]))
        except Exception: pass

        self.fb  = pick_font(11, "bold")
        self.fm  = pick_font(10)
        self.fs  = pick_font(9)
        self.fxl = pick_font(26, "bold")

        self.remaining = self.cfg["interval_min"] * 60
        self.paused    = False
        self.mood      = "idle"
        self.bubble_text = random.choice(IDLE)

        self._build()
        self._tick()
        root.protocol("WM_DELETE_WINDOW", self._close)

    def _build(self):
        root = self.root

        # 裝飾背景
        bg_cv = tk.Canvas(root, width=self.W, height=self.H,
                          bg=BG, highlightthickness=0)
        bg_cv.place(x=0, y=0)
        bg_cv.create_oval(200, -20, 290, 70, fill="#d4eef8", outline="")
        bg_cv.create_oval(-30, 240, 70, 330, fill="#e2f3f9", outline="")

        # 對話泡泡
        self.bubble_var = tk.StringVar(value=self.bubble_text)
        tk.Label(root, textvariable=self.bubble_var,
                 bg=CARD, fg=INK, font=self.fm,
                 wraplength=210, justify="center",
                 padx=12, pady=8, bd=0
                 ).place(x=20, y=14, width=220, height=48)

        # 泡泡尾巴（小三角）
        bg_cv.create_polygon(110, 62, 120, 74, 130, 62, fill=CARD, outline="")

        # 倒數區塊（圓角卡片感用 canvas 畫底）
        timer_cv = tk.Canvas(root, width=220, height=80,
                             bg=CARD, highlightthickness=1,
                             highlightbackground=BORDER)
        timer_cv.place(x=20, y=76)

        tk.Label(root, text="下次提醒", bg=CARD, fg=INK_DIM,
                 font=self.fs).place(x=20, y=84, width=220)
        self.timer_var = tk.StringVar(value="00:00")
        tk.Label(root, textvariable=self.timer_var,
                 bg=CARD, fg=INK, font=self.fxl
                 ).place(x=20, y=102, width=220)

        # 進度點
        self.dot_cv = tk.Canvas(root, width=220, height=28,
                                bg=BG, highlightthickness=0)
        self.dot_cv.place(x=20, y=164)
        self.cups_var = tk.StringVar()
        tk.Label(root, textvariable=self.cups_var,
                 bg=BG, fg=INK_DIM, font=self.fs
                 ).place(x=0, y=194, width=self.W)
        self._draw_dots()

        # 按鈕列 1
        y0 = 216
        self._btn(root, "💧  喝一杯", PILL_A, "#fff", self.drink,  20, y0, 106, 36)
        self._btn(root, "😴  稍後5分", PILL_B, INK,  self.snooze, 134, y0, 106, 36)

        # 按鈕列 2
        y1 = 260
        self.pause_tv = tk.StringVar(value="⏸  暫停")
        self._btnv(root, self.pause_tv, PILL_B, INK, self.toggle_pause, 20,  y1, 68, 34)
        self._btn(root, "↺  重置", RESET_BG, RESET_FG, self.reset,       96,  y1, 68, 34)
        self._btn(root, "⚙  設定", PILL_B, INK, self._settings,          172, y1, 68, 34)

    def _btn(self, p, text, bg, fg, cmd, x, y, w, h):
        b = tk.Button(p, text=text, bg=bg, fg=fg, font=self.fs,
                      activebackground=lerp(bg,"#ffffff",0.2),
                      activeforeground=fg, relief="flat", bd=0,
                      cursor="hand2", command=cmd)
        b.place(x=x, y=y, width=w, height=h)
        return b

    def _btnv(self, p, tv, bg, fg, cmd, x, y, w, h):
        b = tk.Button(p, textvariable=tv, bg=bg, fg=fg, font=self.fs,
                      activebackground=lerp(bg,"#ffffff",0.2),
                      activeforeground=fg, relief="flat", bd=0,
                      cursor="hand2", command=cmd)
        b.place(x=x, y=y, width=w, height=h)
        return b

    def _draw_dots(self):
        c = self.dot_cv; c.delete("all")
        goal = max(1, int(self.cfg["goal_cups"]))
        done = int(self.cfg["cups"])
        r = 8
        spacing = min(24, int(200 / goal))
        x0 = (220 - (goal * spacing - (spacing - r*2))) // 2
        for i in range(goal):
            cx = x0 + i * spacing + r
            cy = 14
            filled = i < done
            if filled:
                c.create_oval(cx-r-2, cy-r-2, cx+r+2, cy+r+2,
                              fill=lerp(DOT_ON,"#ffffff",0.5), outline="")
            c.create_oval(cx-r, cy-r, cx+r, cy+r,
                          fill=DOT_ON if filled else DOT_OFF, outline="")
            if filled:
                c.create_oval(cx-3, cy-5, cx+1, cy-1, fill="#dff3fb", outline="")
        self.cups_var.set(f"今日  {done} / {goal}  杯")

    # ── 倒數 ── #
    def _tick(self):
        if not self.paused:
            self.remaining -= 1
            if self.remaining <= 0:
                self._fire(); self.remaining = self.cfg["interval_min"] * 60
        m, s = divmod(max(0, self.remaining), 60)
        self.timer_var.set("已暫停" if self.paused else f"{m:02d}:{s:02d}")
        self.root.after(1000, self._tick)

    # ── 事件 ── #
    def _fire(self):
        self.bubble_var.set(random.choice(REMIND))
        try:
            if sys.platform.startswith("win"):
                import winsound; winsound.MessageBeep(winsound.MB_ICONASTERISK)
            else: self.root.bell()
        except Exception: pass
        try:
            self.root.deiconify(); self.root.lift()
            self.root.attributes("-topmost", True)
            self.root.after(2000, lambda: self.root.attributes(
                "-topmost", bool(self.cfg["topmost"])))
        except Exception: pass

    def drink(self):
        if self.cfg["cups"] < self.cfg["goal_cups"]:
            self.cfg["cups"] += 1
        self._draw_dots()
        self.remaining = self.cfg["interval_min"] * 60
        self.bubble_var.set(random.choice(DONE) if self.cfg["cups"] >= self.cfg["goal_cups"]
                            else random.choice(PRAISE))
        self.root.after(3000, self._idle)
        save_cfg(self.cfg)

    def snooze(self):
        self.remaining = 5 * 60
        self.bubble_var.set("好啦～5 分鐘後再叫你 (´ω`)")
        self.root.after(2500, self._idle)

    def reset(self):
        self.cfg["cups"] = 0
        self._draw_dots()
        self.remaining = self.cfg["interval_min"] * 60
        self.bubble_var.set("重新開始！今天也要喝滿水 ✦")
        self.root.after(2500, self._idle)
        save_cfg(self.cfg)

    def toggle_pause(self):
        self.paused = not self.paused
        self.pause_tv.set("▶  繼續" if self.paused else "⏸  暫停")
        self.bubble_var.set("先休息，記得回來喝水！" if self.paused else "繼續監督你喝水 ✦")
        self.root.after(2500, self._idle)

    def _idle(self):
        self.bubble_var.set(random.choice(IDLE))

    def _settings(self):
        if hasattr(self, "_sw") and self._sw.winfo_exists():
            self._sw.lift(); return
        win = tk.Toplevel(self.root)
        win.title("設定"); win.configure(bg=CARD)
        win.resizable(False, False)
        self._sw = win

        def lbl(t, r):
            tk.Label(win, text=t, bg=CARD, fg=INK, font=self.fs
                     ).grid(row=r, column=0, sticky="w", padx=16, pady=6)

        lbl("提醒間隔（分鐘）", 0)
        sp = tk.Spinbox(win, from_=5, to=180, increment=5, width=6,
                        font=self.fs, justify="center")
        sp.delete(0,"end"); sp.insert(0, str(self.cfg["interval_min"]))
        sp.grid(row=0, column=1, padx=12, pady=6)

        lbl("每日目標（杯）", 1)
        sp2 = tk.Spinbox(win, from_=1, to=20, increment=1, width=6,
                         font=self.fs, justify="center")
        sp2.delete(0,"end"); sp2.insert(0, str(self.cfg["goal_cups"]))
        sp2.grid(row=1, column=1, padx=12, pady=6)

        tv = tk.IntVar(value=1 if self.cfg["topmost"] else 0)
        tk.Checkbutton(win, text="釘在最上層", variable=tv,
                       bg=CARD, fg=INK, activebackground=CARD, font=self.fs
                       ).grid(row=2, column=0, columnspan=2, pady=6)

        def apply():
            try: self.cfg["interval_min"] = max(5, min(180, int(sp.get())))
            except Exception: pass
            try: self.cfg["goal_cups"] = max(1, min(20, int(sp2.get())))
            except Exception: pass
            self.cfg["topmost"] = bool(tv.get())
            self.remaining = self.cfg["interval_min"] * 60
            try: self.root.attributes("-topmost", self.cfg["topmost"])
            except Exception: pass
            self._draw_dots(); save_cfg(self.cfg); win.destroy()

        tk.Button(win, text="套用", bg=PILL_A, fg="#fff", font=self.fs,
                  relief="flat", bd=0, padx=20, pady=8, command=apply
                  ).grid(row=3, column=0, columnspan=2, pady=12)

    def _close(self):
        save_cfg(self.cfg); self.root.destroy()


def main():
    root = tk.Tk()
    WaterMini(root)
    root.mainloop()

if __name__ == "__main__":
    main()
