import pyttsx3
import PyPDF2
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox

# ---------- Globals ----------
text = ""
current_pos = 0
chunk_size = 800
speak_thread = None
resume_event = threading.Event()
stop_flag = False
thread_lock = threading.Lock()
is_playing = False


# ---------- PDF loading ----------
def load_pdf():
    global text, current_pos, stop_flag
    path = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf")])
    if not path:
        return
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        pages = [p.extract_text() or "" for p in reader.pages]
        text = "\n\n".join(pages)
    current_pos = 0
    stop_flag = False
    update_progress_label()
    messagebox.showinfo("Loaded", f"Loaded {len(pages)} page(s), {len(text)} characters")


# ---------- chunk helper ----------
def get_next_chunk(pos):
    end = min(pos + chunk_size, len(text))
    if end == len(text):
        return text[pos:end]
    last_dot = text.rfind('.', pos, end)
    if last_dot > pos:
        return text[pos:last_dot+1]
    last_space = text.rfind(' ', pos, end)
    if last_space > pos:
        return text[pos:last_space+1]
    return text[pos:end]


# ---------- speaking loop ----------
def speak_loop():
    global current_pos, stop_flag, is_playing

    # Create a fresh pyttsx3 engine for each playback session
    engine = pyttsx3.init()

    while not stop_flag and current_pos < len(text):
        resume_event.wait()
        if stop_flag:
            break

        with thread_lock:
            chunk = get_next_chunk(current_pos)

        engine.setProperty('rate', rate_var.get())
        engine.setProperty('volume', volume_var.get())

        engine.say(chunk)
        try:
            engine.runAndWait()
        except RuntimeError:
            pass

        with thread_lock:
            current_pos += len(chunk)

        root.after(0, update_progress_label)
        time.sleep(0.05)

    # End of file or stopped
    is_playing = False
    resume_event.clear()
    root.after(0, lambda: play_pause_button.config(text="Play"))
    engine.stop()
    del engine


# ---------- control ----------
def toggle_play_pause():
    global speak_thread, stop_flag, is_playing, current_pos

    if not text:
        messagebox.showwarning("No file", "Please load a PDF first.")
        return

    if not is_playing:
        if current_pos >= len(text):
            current_pos = 0

        stop_flag = False
        is_playing = True
        play_pause_button.config(text="Pause")

        speak_thread = threading.Thread(target=speak_loop, daemon=True)
        speak_thread.start()

        resume_event.set()
    else:
        is_playing = False
        play_pause_button.config(text="Play")
        resume_event.clear()


def stop_playback():
    global stop_flag, current_pos, is_playing
    stop_flag = True
    resume_event.clear()
    with thread_lock:
        current_pos = 0
    is_playing = False
    play_pause_button.config(text="Play")
    update_progress_label()


def set_volume(val):
    pass  # volume is applied inside speak_loop before each chunk


def set_rate(val):
    pass  # rate is applied inside speak_loop before each chunk


# ---------- UI updates ----------
def update_progress_label():
    if not text:
        prog_text = "No file loaded"
    else:
        pct = int((current_pos / max(1, len(text))) * 100)
        prog_text = f"Progress: {pct}% ({current_pos}/{len(text)} chars)"
    progress_label.config(text=prog_text)


# ---------- Tkinter GUI ----------
root = tk.Tk()
root.title("PDF → Audio Player")

tk.Button(root, text="Load PDF", width=12, command=load_pdf).pack(pady=6)
play_pause_button = tk.Button(root, text="Play", width=12, command=toggle_play_pause)
play_pause_button.pack(pady=2)
tk.Button(root, text="Stop", width=12, command=stop_playback).pack(pady=2)

# Volume slider
tk.Label(root, text="Volume").pack(pady=(10, 0))
volume_var = tk.DoubleVar(value=1.0)
tk.Scale(root, from_=0.0, to=1.0, resolution=0.01, orient=tk.HORIZONTAL,
         variable=volume_var, command=set_volume, length=300).pack(padx=10)

# Speed slider
tk.Label(root, text="Speed (rate)").pack(pady=(10, 0))
rate_var = tk.IntVar(value=200)
tk.Scale(root, from_=80, to=450, orient=tk.HORIZONTAL,
         variable=rate_var, command=set_rate, length=300).pack(padx=10)

progress_label = tk.Label(root, text="No file loaded")
progress_label.pack(pady=10)

root.mainloop()
