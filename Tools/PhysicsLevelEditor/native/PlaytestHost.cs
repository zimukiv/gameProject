using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

// Hosts the isolated Unity Windows Player inside an existing Win32 window.
// The Electron renderer never gets a raw HWND: it only reports a client-area
// rectangle to the main process, which controls this helper over stdin/stdout.
public static class PlaytestHost
{
    const int GWL_STYLE = -16;
    const int GWL_EXSTYLE = -20;
    const int GWL_HWNDPARENT = -8;
    const long WS_CHILD = 0x40000000L;
    const long WS_POPUP = unchecked((long)0x80000000L);
    const long WS_CAPTION = 0x00C00000L;
    const long WS_THICKFRAME = 0x00040000L;
    const long WS_MINIMIZEBOX = 0x00020000L;
    const long WS_MAXIMIZEBOX = 0x00010000L;
    const long WS_SYSMENU = 0x00080000L;
    const long WS_VISIBLE = 0x10000000L;
    const long WS_CLIPSIBLINGS = 0x04000000L;
    const long WS_CLIPCHILDREN = 0x02000000L;
    const long WS_EX_APPWINDOW = 0x00040000L;
    const long WS_EX_TOOLWINDOW = 0x00000080L;
    const uint SWP_FRAMECHANGED = 0x0020;
    const uint SWP_SHOWWINDOW = 0x0040;
    const uint SWP_NOACTIVATE = 0x0010;
    const uint SWP_NOZORDER = 0x0004;
    const int SW_SHOW = 5;
    const int SW_HIDE = 0;
    const uint WM_ACTIVATE = 0x0006;
    const uint WM_CLOSE = 0x0010;
    const uint GA_ROOT = 2;
    const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    const int JobObjectExtendedLimitInformation = 9;
    // The isolated Player stores SettingsManager.PREF_FULLSCREEN in the game's
    // own PlayerPrefs key. Unity hashes PlayerPrefs keys with djb2x; the hash
    // for "GameFullscreen" is 3745021268. The game forces fullscreen on Awake
    // when this value is absent or 1, which breaks embedding. The host sets it
    // to 0 only for the lifetime of the playtest and restores it afterwards.
    const string PrefsSubKey = @"Software\MiniGame Team Phase4A Test\Physics Level Editor Phase4A Isolated";
    const string FullscreenValue = "GameFullscreen_h3745021268";

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public int LimitFlags; public UIntPtr MinimumWorkingSetSize,
      MaximumWorkingSetSize; public int ActiveProcessLimit; public UIntPtr Affinity; public int PriorityClass, SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS
    { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
      public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }

    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
    [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter,
      int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr hwnd, int x, int y,
      int width, int height, bool repaint);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint attachTo, bool doAttach);
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetFocus();
    [DllImport("kernel32.dll")] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int infoClass,
      IntPtr info, uint length);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    sealed class Options
    {
        public long Parent;
        public int X, Y, ScreenX, ScreenY, Width, Height;
        public string Exe;
        public string Mode = "auto";
        public bool SelfHost;
        public bool TopMost;
        public bool KeepFrame;
        public bool ForceD3D11;
        public int DelayEmbedMs;
        public List<string> UnityArgs = new List<string>();
    }

    static Options Parse(string[] args)
    {
        var options = new Options { Width = 960, Height = 540 };
        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i];
            if (arg == "--") { for (i++; i < args.Length; i++) options.UnityArgs.Add(args[i]); break; }
            switch (arg)
            {
                case "--parent": options.Parent = long.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--x": options.X = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--y": options.Y = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--screen-x": options.ScreenX = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--screen-y": options.ScreenY = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--width": options.Width = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--height": options.Height = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--exe": options.Exe = args[++i]; break;
                case "--mode": options.Mode = args[++i]; break;
                case "--self-host": options.SelfHost = true; break;
                case "--topmost": options.TopMost = true; break;
                case "--keep-frame": options.KeepFrame = true; break;
                case "--force-d3d11": options.ForceD3D11 = true; break;
                case "--delay-embed": options.DelayEmbedMs = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                default: throw new ArgumentException("Unknown PlaytestHost argument: " + arg);
            }
        }
        if (options.ScreenX == 0 && options.ScreenY == 0) { options.ScreenX = options.X; options.ScreenY = options.Y; }
        if (string.IsNullOrEmpty(options.Exe) || !File.Exists(options.Exe))
            throw new ArgumentException("Unity Player EXE is missing");
        return options;
    }

    static string ClassOf(IntPtr hwnd)
    {
        var text = new StringBuilder(256);
        GetClassName(hwnd, text, text.Capacity);
        return text.ToString();
    }

    static string TitleOf(IntPtr hwnd)
    {
        var text = new StringBuilder(512);
        GetWindowText(hwnd, text, text.Capacity);
        return text.ToString();
    }

    static IntPtr FindWindow(int pid, IntPtr parent, bool includeTopLevel)
    {
        IntPtr best = IntPtr.Zero;
        EnumWindowsProc visit = (hwnd, _) =>
        {
            uint owner;
            GetWindowThreadProcessId(hwnd, out owner);
            if (owner == (uint)pid && ClassOf(hwnd).IndexOf("Unity", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                if (best == IntPtr.Zero || IsWindowVisible(hwnd)) best = hwnd;
            }
            return true;
        };
        if (parent != IntPtr.Zero) EnumChildWindows(parent, visit, IntPtr.Zero);
        if (includeTopLevel && best == IntPtr.Zero) EnumWindows(visit, IntPtr.Zero);
        return best;
    }

    static IntPtr WaitForWindow(Process process, IntPtr parent, int seconds)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < deadline)
        {
            if (process.HasExited) return IntPtr.Zero;
            IntPtr hwnd = FindWindow(process.Id, parent, true);
            if (hwnd != IntPtr.Zero) return hwnd;
            Thread.Sleep(100);
        }
        return IntPtr.Zero;
    }

    static void Log(string message)
    {
        Console.Out.WriteLine(message);
        Console.Out.Flush();
    }

    static string Quote(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
        var builder = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"')
            {
                builder.Append('\\', slashes * 2 + 1).Append('"');
                slashes = 0;
                continue;
            }
            builder.Append('\\', slashes).Append(c);
            slashes = 0;
        }
        builder.Append('\\', slashes * 2).Append('"');
        return builder.ToString();
    }

    sealed class Host : IDisposable
    {
        readonly Options options;
        readonly IntPtr parent;
        Process unity;
        IntPtr window;
        string mode;
        volatile bool stopping;
        volatile bool expectedHidden;
        int lastChildX, lastChildY, lastScreenX, lastScreenY, lastWidth, lastHeight;
        readonly object gate = new object();
        bool prefsChanged;
        object previousFullscreen;
        public int LastExitCode = -1;

        public Host(Options options, IntPtr parent)
        {
            this.options = options;
            this.parent = parent;
            mode = options.Mode;
        }

        public void Start()
        {
            var info = new ProcessStartInfo
            {
                FileName = options.Exe,
                WorkingDirectory = Path.GetDirectoryName(options.Exe),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            ApplyWindowedPrefs();
            var parts = new List<string>();
            if (mode == "child" || mode == "unity")
            {
                parts.Add("-parentHWND");
                parts.Add(parent.ToInt64().ToString(CultureInfo.InvariantCulture));
                parts.Add("delayed");
            }
            if (options.ForceD3D11) parts.Add("-force-d3d11");
            parts.Add("-screen-fullscreen");
            parts.Add("0");
            parts.Add("-screen-width");
            parts.Add(options.Width.ToString(CultureInfo.InvariantCulture));
            parts.Add("-screen-height");
            parts.Add(options.Height.ToString(CultureInfo.InvariantCulture));
            parts.Add("-window-mode");
            parts.Add("windowed");
            parts.AddRange(options.UnityArgs);
            var builder = new StringBuilder();
            foreach (string part in parts) builder.Append(Quote(part)).Append(' ');
            info.Arguments = builder.ToString();
            unity = Process.Start(info);
            if (unity == null) throw new InvalidOperationException("Could not start Unity Player");
            // Drain Unity's inherited streams so engine output can never corrupt
            // this helper's stdin/stdout control protocol.
            unity.OutputDataReceived += (_, __) => { };
            unity.ErrorDataReceived += (_, __) => { };
            unity.BeginOutputReadLine();
            unity.BeginErrorReadLine();
            AttachKillOnCloseJob(unity);
            Log("UNITY_PID pid=" + unity.Id.ToString(CultureInfo.InvariantCulture));

            window = WaitForWindow(unity, parent, 45);
            if (window == IntPtr.Zero)
                throw new InvalidOperationException("Unity Player window did not appear within 45s");
            Log("WINDOW hwnd=" + window.ToInt64().ToString(CultureInfo.InvariantCulture) +
                " class=" + ClassOf(window) + " title=" + TitleOf(window));

            if (options.DelayEmbedMs > 0)
            {
                Log("WAIT_EMBED ms=" + options.DelayEmbedMs.ToString(CultureInfo.InvariantCulture));
                Thread.Sleep(options.DelayEmbedMs);
            }

            if (mode == "unity")
            {
                // Let Unity itself perform the -parentHWND delayed attachment and
                // do not touch the window style. This isolates engine-owned
                // embedding from host-owned restyling.
                DateTime deadline = DateTime.UtcNow.AddSeconds(20);
                while (DateTime.UtcNow < deadline && !stopping)
                {
                    if (!IsWindow(window)) break;
                    if (IsChild(parent, window) || GetAncestor(window, GA_ROOT) == parent)
                    {
                        Log("UNITY_EMBED parent=" + GetParent(window).ToInt64().ToString(CultureInfo.InvariantCulture));
                        mode = "child";
                        break;
                    }
                    Thread.Sleep(100);
                }
                if (mode == "unity")
                {
                    Log("UNITY_EMBED_TIMEOUT fallback=child");
                    EmbedChild();
                }
            }
            else EmbedOwned();
            Resize(options.X, options.Y, options.ScreenX, options.ScreenY, options.Width, options.Height);
            Show();
            FocusUnity();
            Log("READY hwnd=" + window.ToInt64().ToString(CultureInfo.InvariantCulture) +
                " mode=" + mode + " onTop=" + (IsOnTop() ? "1" : "0"));
            var watchdog = new Thread(Watchdog) { IsBackground = true };
            watchdog.Start();
        }

        void ApplyWindowedPrefs()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(PrefsSubKey))
                {
                    if (key == null) return;
                    previousFullscreen = key.GetValue(FullscreenValue, null);
                    key.SetValue(FullscreenValue, 0, RegistryValueKind.DWord);
                    prefsChanged = true;
                    Log("PREFS fullscreen=0 previous=" + (previousFullscreen == null ? "absent" : previousFullscreen.ToString()));
                }
            }
            catch (Exception error) { Log("PREFS_WARN " + error.Message); }
        }

        void RestoreWindowedPrefs()
        {
            if (!prefsChanged) return;
            prefsChanged = false;
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(PrefsSubKey, true))
                {
                    if (key == null) return;
                    if (previousFullscreen == null) key.DeleteValue(FullscreenValue, false);
                    else key.SetValue(FullscreenValue, previousFullscreen, RegistryValueKind.DWord);
                }
            }
            catch (Exception error) { Log("PREFS_RESTORE_WARN " + error.Message); }
        }

        static void AttachKillOnCloseJob(Process process)
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) return;
            var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr pointer = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(info, pointer, false);
                if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, pointer, (uint)size) ||
                    !AssignProcessToJobObject(job, process.Handle)) CloseHandle(job);
            }
            finally { Marshal.FreeHGlobal(pointer); }
        }

        void EmbedChild()
        {
            if (options.KeepFrame) Log("KEEP_FRAME ignored in child mode");
            long style = GetWindowLongPtr(window, GWL_STYLE).ToInt64();
            style &= ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
            style |= WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS;
            SetWindowLongPtr(window, GWL_STYLE, new IntPtr(style));
            IntPtr previous = SetParent(window, parent);
            Log("SETPARENT child=" + window.ToInt64().ToString(CultureInfo.InvariantCulture) +
                " parent=" + parent.ToInt64().ToString(CultureInfo.InvariantCulture) +
                " previous=" + previous.ToInt64().ToString(CultureInfo.InvariantCulture));
            long parentStyle = GetWindowLongPtr(parent, GWL_STYLE).ToInt64();
            SetWindowLongPtr(parent, GWL_STYLE, new IntPtr(parentStyle | WS_CLIPCHILDREN));
            mode = "child";
        }

        void EmbedOwned()
        {
            if (!options.KeepFrame)
            {
                long style = GetWindowLongPtr(window, GWL_STYLE).ToInt64();
                style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
                style |= WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS;
                SetWindowLongPtr(window, GWL_STYLE, new IntPtr(style));
                long exStyle = GetWindowLongPtr(window, GWL_EXSTYLE).ToInt64();
                exStyle = (exStyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
                SetWindowLongPtr(window, GWL_EXSTYLE, new IntPtr(exStyle));
            }
            else
            {
                Log("KEEP_FRAME style untouched");
            }
            SetParent(window, IntPtr.Zero);
            SetWindowLongPtr(window, GWL_HWNDPARENT, parent);
            mode = "owned";
        }

        void SwitchToOwned()
        {
            SetParent(window, IntPtr.Zero);
            long style = GetWindowLongPtr(window, GWL_STYLE).ToInt64();
            style &= ~(WS_CHILD | WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
            style |= WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS;
            SetWindowLongPtr(window, GWL_STYLE, new IntPtr(style));
            long exStyle = GetWindowLongPtr(window, GWL_EXSTYLE).ToInt64();
            exStyle = (exStyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
            SetWindowLongPtr(window, GWL_EXSTYLE, new IntPtr(exStyle));
            SetWindowLongPtr(window, GWL_HWNDPARENT, parent);
            mode = "owned";
        }

        bool IsOnTop()
        {
            RECT rect;
            if (!GetWindowRect(window, out rect)) return false;
            POINT point = new POINT { X = (rect.Left + rect.Right) / 2, Y = (rect.Top + rect.Bottom) / 2 };
            IntPtr top = WindowFromPoint(point);
            if (top == IntPtr.Zero) return false;
            return top == window || IsChild(window, top) || GetAncestor(top, GA_ROOT) == window;
        }

        public void Resize(int childX, int childY, int screenX, int screenY, int width, int height)
        {
            width = Math.Max(1, width);
            height = Math.Max(1, height);
            lastChildX = childX;
            lastChildY = childY;
            lastScreenX = screenX;
            lastScreenY = screenY;
            lastWidth = width;
            lastHeight = height;
            if (window == IntPtr.Zero) return;
            if (mode == "owned")
                SetWindowPos(window, IntPtr.Zero, screenX, screenY, width, height,
                    SWP_NOACTIVATE | SWP_SHOWWINDOW);
            else
                SetWindowPos(window, IntPtr.Zero, childX, childY, width, height,
                    SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED);
        }

        static int Abs(int value) { return value < 0 ? -value : value; }

        void Watchdog()
        {
            while (!stopping)
            {
                Thread.Sleep(500);
                if (stopping || expectedHidden) continue;
                try
                {
                    if (unity == null || unity.HasExited) return;
                    if (window == IntPtr.Zero || !IsWindow(window))
                    {
                        IntPtr found = FindWindow(unity.Id, parent, true);
                        if (found == IntPtr.Zero) continue;
                        window = found;
                        if (mode == "owned") EmbedOwned(); else EmbedChild();
                        Log("RECOVER hwnd=" + window.ToInt64().ToString(CultureInfo.InvariantCulture));
                    }
                    if (!IsWindowVisible(parent))
                        ShowWindow(parent, 4);
                    long style = GetWindowLongPtr(window, GWL_STYLE).ToInt64();
                    if ((style & WS_VISIBLE) == 0)
                        ShowWindow(window, 4);
                    if (mode == "child" && (style & WS_CHILD) == 0) EmbedChild();
                    POINT origin = new POINT();
                    ClientToScreen(parent, ref origin);
                    RECT current;
                    if (!GetWindowRect(window, out current)) continue;
                    int desiredX = mode == "owned" ? lastScreenX : origin.X + lastChildX;
                    int desiredY = mode == "owned" ? lastScreenY : origin.Y + lastChildY;
                    if (Abs(current.Left - desiredX) > 2 || Abs(current.Top - desiredY) > 2 ||
                        Abs((current.Right - current.Left) - lastWidth) > 2 ||
                        Abs((current.Bottom - current.Top) - lastHeight) > 2)
                        Resize(lastChildX, lastChildY, lastScreenX, lastScreenY, lastWidth, lastHeight);
                }
                catch { }
            }
        }

        public void Show()
        {
            expectedHidden = false;
            if (window != IntPtr.Zero) { ShowWindow(window, SW_SHOW); SendMessage(window, WM_ACTIVATE, new IntPtr(1), IntPtr.Zero); }
        }

        public void Hide()
        {
            expectedHidden = true;
            if (window != IntPtr.Zero) ShowWindow(window, SW_HIDE);
        }

        public void FocusUnity()
        {
            if (window == IntPtr.Zero) return;
            uint unusedProcessId;
            uint unityThread = GetWindowThreadProcessId(window, out unusedProcessId);
            uint current = GetCurrentThreadId();
            bool attached = unityThread != current && AttachThreadInput(current, unityThread, true);
            try
            {
                if (mode == "owned") SetForegroundWindow(window);
                SetFocus(window);
                SendMessage(window, WM_ACTIVATE, new IntPtr(1), IntPtr.Zero);
                Log("FOCUS hwnd=" + window.ToInt64().ToString(CultureInfo.InvariantCulture) +
                    " focus=" + GetFocus().ToInt64().ToString(CultureInfo.InvariantCulture));
            }
            finally { if (attached) AttachThreadInput(current, unityThread, false); }
        }

        public void Stop()
        {
            lock (gate)
            {
                if (stopping) return;
                stopping = true;
            }
            if (window != IntPtr.Zero) PostMessage(window, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            if (unity != null && !unity.WaitForExit(4000))
            {
                try { unity.Kill(); } catch { }
                if (!unity.WaitForExit(4000)) Log("STOP_FAILED pid=" + unity.Id);
            }
        }

        public void Dispose()
        {
            Stop();
            if (unity != null)
            {
                try
                {
                    if (unity.HasExited) LastExitCode = unity.ExitCode;
                    else { unity.Kill(); unity.WaitForExit(2000); LastExitCode = unity.ExitCode; }
                }
                catch { }
                unity.Dispose();
            }
            RestoreWindowedPrefs();
        }

        public bool HasExited { get { return unity != null && unity.HasExited; } }
        public int ExitCode { get { try { return unity.HasExited ? unity.ExitCode : -1; } catch { return -1; } } }

        public void PumpStdIn()
        {
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                line = line.Trim();
                if (line.Length == 0) continue;
                string[] parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                try
                {
                    switch (parts[0].ToUpperInvariant())
                    {
                        case "RESIZE":
                            if (parts.Length >= 7)
                                Resize(int.Parse(parts[1], CultureInfo.InvariantCulture),
                                    int.Parse(parts[2], CultureInfo.InvariantCulture),
                                    int.Parse(parts[3], CultureInfo.InvariantCulture),
                                    int.Parse(parts[4], CultureInfo.InvariantCulture),
                                    int.Parse(parts[5], CultureInfo.InvariantCulture),
                                    int.Parse(parts[6], CultureInfo.InvariantCulture));
                            break;
                        case "FOCUS": FocusUnity(); break;
                        case "SHOW": Show(); break;
                        case "HIDE": Hide(); break;
                        case "STOP": Stop(); return;
                        case "PING": Log("PONG mode=" + mode + " onTop=" + (IsOnTop() ? "1" : "0")); break;
                    }
                }
                catch (Exception error) { Log("COMMAND_ERROR " + error.Message); }
            }
        }
    }

    static Host host;
    static Form form;

    static void SetDpiAwareness()
    {
        try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
        try { SetProcessDPIAware(); } catch { }
    }

    [STAThread]
    public static int Main(string[] args)
    {
        try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
        SetDpiAwareness();
        Options options;
        try { options = Parse(args); }
        catch (Exception error) { Log("ERROR " + error.Message); return 2; }

        IntPtr parent = new IntPtr(options.Parent);
        if (options.SelfHost)
        {
            Application.EnableVisualStyles();
            form = new Form
            {
                Text = "PlaytestHost self test",
                StartPosition = FormStartPosition.CenterScreen,
                ClientSize = new Size(options.Width, options.Height),
                BackColor = Color.Black,
                TopMost = options.TopMost
            };
            form.Shown += (_, __) =>
            {
                try
                {
                    Point clientOrigin = form.PointToScreen(Point.Empty);
                    options.ScreenX = clientOrigin.X;
                    options.ScreenY = clientOrigin.Y;
                    host = new Host(options, form.Handle);
                    host.Start();
                    form.Activate();
                    SetForegroundWindow(form.Handle);
                    Log("FORM visible=" + (form.Visible ? "1" : "0") + " handle=" +
                        form.Handle.ToInt64().ToString(CultureInfo.InvariantCulture));
                    host.FocusUnity();
                    var reader = new Thread(host.PumpStdIn) { IsBackground = true };
                    reader.Start();
                }
                catch (Exception error) { Log("ERROR " + error); form.Close(); }
            };
            form.Resize += (_, __) =>
            {
                if (host == null) return;
                RECT client;
                GetClientRect(form.Handle, out client);
                Point origin = form.PointToScreen(Point.Empty);
                host.Resize(0, 0, origin.X, origin.Y, client.Right - client.Left, client.Bottom - client.Top);
            };
            form.Move += (_, __) =>
            {
                if (host == null) return;
                RECT client;
                GetClientRect(form.Handle, out client);
                Point origin = form.PointToScreen(Point.Empty);
                host.Resize(0, 0, origin.X, origin.Y, client.Right - client.Left, client.Bottom - client.Top);
            };
            form.FormClosing += (_, __) => { if (host != null) host.Stop(); };
            Application.Run(form);
            if (host != null) host.Dispose();
            return 0;
        }

        if (parent == IntPtr.Zero) { Log("ERROR --parent is required"); return 2; }
        try
        {
            host = new Host(options, parent);
            host.Start();
        }
        catch (Exception error) { Log("ERROR " + error); return 3; }

        var input = new Thread(host.PumpStdIn) { IsBackground = true };
        input.Start();
        while (!host.HasExited) Thread.Sleep(80);
        Log("EXIT code=" + host.ExitCode.ToString(CultureInfo.InvariantCulture));
        host.Dispose();
        return 0;
    }
}
