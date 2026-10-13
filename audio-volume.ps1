$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
# Windows Core Audio session volume. Never opens the endpoint/master-volume interface.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, uint state, out IDeviceCollection devices);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
    [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionManager {
    [PreserveSig] int GetAudioSessionControl(ref Guid id, uint flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(ref Guid id, uint flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out ISessionEnumerator sessions);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object control);
}
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionControl {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
    [PreserveSig] int GetGroupingParam(out Guid grouping);
    [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetProcessId(out uint pid);
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid context);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
public class AudioRecord { public uint Pid; public float Volume; public bool Muted; }
public static class AppAudio {
    static void Check(int hr) { Marshal.ThrowExceptionForHR(hr); }
    static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
    public static AudioRecord[] Apply(int[] pids, float level, bool mute, bool readOnly) {
        var allowed = new HashSet<int>(pids ?? new int[0]);
        var records = new List<AudioRecord>();
        object enumeratorObject = new DeviceEnumerator();
        IDeviceCollection devices = null;
        try {
            Check(((IDeviceEnumerator)enumeratorObject).EnumAudioEndpoints(0, 1, out devices));
            uint devicesCount; Check(devices.GetCount(out devicesCount));
            for (uint d = 0; d < devicesCount; d++) {
                IDevice device = null; object managerObject = null; ISessionEnumerator sessions = null;
                try {
                    Check(devices.Item(d, out device));
                    Guid iid = typeof(ISessionManager).GUID;
                    Check(device.Activate(ref iid, 23, IntPtr.Zero, out managerObject));
                    Check(((ISessionManager)managerObject).GetSessionEnumerator(out sessions));
                    int count; Check(sessions.GetCount(out count));
                    for (int i = 0; i < count; i++) {
                        object sessionObject = null;
                        try {
                            Check(sessions.GetSession(i, out sessionObject));
                            uint pid; Check(((ISessionControl)sessionObject).GetProcessId(out pid));
                            if (pid == 0 || !allowed.Contains((int)pid)) continue;
                            var volume = (ISessionVolume)sessionObject;
                            Guid context = Guid.Empty;
                            if (!readOnly) {
                                Check(volume.SetMasterVolume(Math.Max(0, Math.Min(1, level)), ref context));
                                Check(volume.SetMute(mute, ref context));
                            }
                            float actual; bool muted;
                            Check(volume.GetMasterVolume(out actual)); Check(volume.GetMute(out muted));
                            records.Add(new AudioRecord { Pid = pid, Volume = actual, Muted = muted });
                        } catch (COMException) { /* A session can expire during enumeration. */ }
                        finally { Release(sessionObject); }
                    }
                } catch (COMException) { /* A device can disconnect while audio is playing. */ }
                finally { Release(sessions); Release(managerObject); Release(device); }
            }
        } finally { Release(devices); Release(enumeratorObject); }
        return records.ToArray();
    }
}
'@

# One hidden worker per app; only the app-owned PID allowlist arrives through stdin.
while ($null -ne ($line = [Console]::ReadLine())) {
    try {
        $request = ConvertFrom-Json -InputObject $line
        $records = [AppAudio]::Apply([int[]]$request.pids, [float]($request.volume / 100), [bool]$request.muted, [bool]$request.readOnly)
        [Console]::WriteLine((ConvertTo-Json -Compress -Depth 3 -InputObject @{ ok = $true; sessions = @($records) }))
    } catch { [Console]::WriteLine((ConvertTo-Json -Compress -InputObject @{ ok = $false; error = $_.Exception.Message })) }
}
