$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public static class QuickClose {
    delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
    static readonly object gate = new object();
    static readonly Stopwatch clock = Stopwatch.StartNew();
    static readonly HookProc callback = Handle;
    static IntPtr hook;
    static int selected, hideKey, activeKey, firstKey;
    static bool down, candidate;
    static long pressedAt, firstTap = -1;
    static int Normalize(int key) {
        if (key == 164 || key == 165) return 18;
        if (key == 160 || key == 161) return 16;
        if (key == 162 || key == 163) return 17;
        if (key == 92) return 91;
        return key;
    }
    static IntPtr Handle(int code, IntPtr message, IntPtr data) {
        bool close = false, hide = false;
        if (code >= 0) {
            int type = message.ToInt32(), key = Normalize(Marshal.ReadInt32(data));
            bool keyDown = type == 256 || type == 260;
            bool keyUp = type == 257 || type == 261;
            lock (gate) {
                if (selected != 0 || hideKey != 0) {
                    if (keyDown && down && key != activeKey) { candidate = false; firstTap = -1; }
                    if (keyDown && key != selected && key != hideKey) { candidate = false; firstTap = -1; }
                    if ((key == selected || key == hideKey) && keyDown && !down) {
                        down = true; activeKey = key; candidate = true; pressedAt = clock.ElapsedMilliseconds;
                        foreach (int modifier in new int[] {16,17,18,91,92}) {
                            if (Normalize(modifier) != activeKey && (GetAsyncKeyState(modifier) & 0x8000) != 0) candidate = false;
                        }
                    }
                    if (key == activeKey && keyUp && down) {
                        down = false;
                        long now = clock.ElapsedMilliseconds;
                        if (candidate && now - pressedAt <= 450) {
                            bool twice = firstTap >= 0 && firstKey == key && now - firstTap <= 450;
                            close = twice && key == selected;
                            hide = twice && key == hideKey;
                            firstTap = twice ? -1 : now; firstKey = key;
                        } else firstTap = -1;
                        candidate = false;
                    }
                }
            }
        }
        // Pass every event through unchanged; only report the configured double tap.
        if (close) Console.WriteLine("close");
        if (hide) Console.WriteLine("hide");
        return CallNextHookEx(hook, code, message, data);
    }
    public static void Run() {
        hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        Thread reader = new Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                int key, toggle;
                string[] values = line.Split(',');
                if (values.Length == 2 && Int32.TryParse(values[0], out key) && Int32.TryParse(values[1], out toggle) && key >= 0 && key <= 255 && (toggle == 0 || toggle == 18)) {
                    lock (gate) { selected = key; hideKey = toggle; down = false; candidate = false; firstTap = -1; }
                    Console.WriteLine("configured");
                }
            }
            // The parent pipe closes on exit, including when Electron crashes.
            Environment.Exit(0);
        });
        reader.IsBackground = true; reader.Start();
        Console.WriteLine("ready");
        try { Application.Run(); } finally { UnhookWindowsHookEx(hook); }
    }
}
'@
[QuickClose]::Run()
