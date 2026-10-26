using System;
using System.Collections.Generic;
using UnityEngine;

// Local keyboard preferences for the connected RoomLab player.
public sealed class RoomLabKeyBindings
{
    public enum ActionId { Left,Right,Jump,Crouch,Dash,Retry,SelectRoom }
    public const int ActionCount=7,SlotCount=3;
    private const string PreferenceKey="RoomLab.KeyboardBindings.v1";
    private readonly KeyCode[,] keys=new KeyCode[ActionCount,SlotCount];
    private static readonly string[] labels={"向左移动","向右移动","跳跃","下蹲","冲刺","重试房间","选择房间"};
    private static readonly KeyCode[] keyboardKeys=FindKeyboardKeys();
    [Serializable] private class SavedRow { public int action; public int[] keys; }
    [Serializable] private class SavedProfile { public int version=1; public SavedRow[] bindings; }

    public RoomLabKeyBindings() { ResetDefaults(); }
    public static RoomLabKeyBindings Load()
    {
        var result=new RoomLabKeyBindings();
        result.TryLoadJson(PlayerPrefs.GetString(PreferenceKey,""));
        return result;
    }
    public void Save() { PlayerPrefs.SetString(PreferenceKey,ToJson());PlayerPrefs.Save(); }
    public void ResetDefaults()
    {
        Array.Clear(keys,0,keys.Length);
        SetDefaults(ActionId.Left,KeyCode.A,KeyCode.LeftArrow);
        SetDefaults(ActionId.Right,KeyCode.D,KeyCode.RightArrow);
        SetDefaults(ActionId.Jump,KeyCode.Space,KeyCode.W,KeyCode.UpArrow);
        SetDefaults(ActionId.Crouch,KeyCode.S,KeyCode.DownArrow);
        SetDefaults(ActionId.Dash,KeyCode.LeftShift,KeyCode.RightShift);
        SetDefaults(ActionId.Retry,KeyCode.R);
        SetDefaults(ActionId.SelectRoom,KeyCode.F1);
    }
    private void SetDefaults(ActionId action,params KeyCode[] values)
    {
        for(int slot=0;slot<values.Length;slot++)keys[(int)action,slot]=values[slot];
    }
    public static string Label(ActionId action) => labels[(int)action];
    public KeyCode GetKey(ActionId action,int slot) => keys[(int)action,slot];
    public bool IsHeld(ActionId action) => IsActive(action,GameInput.IsHeldExact);
    public bool WasPressed(ActionId action) => IsActive(action,GameInput.WasPressedExact);
    public bool IsActive(ActionId action,Func<KeyCode,bool> read)
    {
        for(int slot=0;slot<SlotCount;slot++)
            if(keys[(int)action,slot]!=KeyCode.None&&read(keys[(int)action,slot]))return true;
        return false;
    }
    public bool TryBind(ActionId action,int slot,KeyCode key,out string message)
    {
        if((int)action<0||(int)action>=ActionCount||slot<0||slot>=SlotCount)
        {message="无效的键位。";return false;}
        if(key!=KeyCode.None&&!IsBindable(key))
        {message="Esc 用于返回菜单；请选择其他键盘按键。";return false;}
        int count=0;
        for(int s=0;s<SlotCount;s++)if(keys[(int)action,s]!=KeyCode.None)count++;
        if(key==KeyCode.None&&keys[(int)action,slot]!=KeyCode.None&&count<=1)
        {message="每项操作至少需要保留一个按键。";return false;}
        for(int a=0;a<ActionCount;a++)for(int s=0;s<SlotCount;s++)
            if(key!=KeyCode.None&&keys[a,s]==key&&(a!=(int)action||s!=slot))
            {message=KeyName(key)+" 已用于“"+labels[a]+"”，请换一个键，或先清除原绑定。";return false;}
        keys[(int)action,slot]=key;
        message=key==KeyCode.None?"已清除备用按键，并保存。":"已将“"+Label(action)+"”绑定为 "+KeyName(key)+"，并保存。";
        return true;
    }
    public string ToJson()
    {
        var profile=new SavedProfile{bindings=new SavedRow[ActionCount]};
        for(int a=0;a<ActionCount;a++)
        {
            var row=new SavedRow{action=a,keys=new int[SlotCount]};
            for(int s=0;s<SlotCount;s++)row.keys[s]=(int)keys[a,s];
            profile.bindings[a]=row;
        }
        return JsonUtility.ToJson(profile);
    }
    public bool TryLoadJson(string json)
    {
        if(string.IsNullOrEmpty(json))return false;
        try
        {
            var profile=JsonUtility.FromJson<SavedProfile>(json);
            if(profile==null||profile.version!=1||profile.bindings==null||profile.bindings.Length!=ActionCount)return false;
            var candidate=new KeyCode[ActionCount,SlotCount];
            var actions=new HashSet<int>();var occupied=new HashSet<KeyCode>();
            foreach(var row in profile.bindings)
            {
                if(row==null||row.action<0||row.action>=ActionCount||!actions.Add(row.action)||row.keys==null||row.keys.Length!=SlotCount)return false;
                bool any=false;
                for(int s=0;s<SlotCount;s++)
                {
                    var key=(KeyCode)row.keys[s];
                    if(key!=KeyCode.None)
                    {
                        if(!IsBindable(key)||!occupied.Add(key))return false;
                        any=true;
                    }
                    candidate[row.action,s]=key;
                }
                if(!any)return false;
            }
            Array.Copy(candidate,keys,keys.Length);return true;
        }
        catch(ArgumentException) { return false; }
    }
    public static bool IsBindable(KeyCode key) => key!=KeyCode.None&&key!=KeyCode.Escape&&
        (int)key<(int)KeyCode.Mouse0&&key!=KeyCode.LeftWindows&&key!=KeyCode.RightWindows&&
        Enum.IsDefined(typeof(KeyCode),key);
    private static KeyCode[] FindKeyboardKeys()
    {
        var result=new List<KeyCode>();
        foreach(KeyCode key in Enum.GetValues(typeof(KeyCode)))
            if(IsBindable(key)&&!result.Contains(key))result.Add(key);
        return result.ToArray();
    }
    public static bool TryReadPressedKey(out KeyCode key)
    {
        foreach(var candidate in keyboardKeys)
            if(GameInput.WasPressedExact(candidate)){key=candidate;return true;}
        key=KeyCode.None;return false;
    }
    public string KeysLabel(ActionId action)
    {
        var names=new List<string>();
        for(int s=0;s<SlotCount;s++)if(GetKey(action,s)!=KeyCode.None)names.Add(KeyName(GetKey(action,s)));
        return string.Join("/",names);
    }
    public string HelpText() => KeysLabel(ActionId.Left)+" 左 · "+KeysLabel(ActionId.Right)+" 右 · "+
        KeysLabel(ActionId.Jump)+" 跳跃 · "+KeysLabel(ActionId.Crouch)+" 下蹲 · "+KeysLabel(ActionId.Dash)+
        " 冲刺 · "+KeysLabel(ActionId.Retry)+" 重试 · Esc菜单 · "+KeysLabel(ActionId.SelectRoom)+" 选房";
    public static string KeyName(KeyCode key)
    {
        switch(key)
        {
            case KeyCode.None:return "未设置";
            case KeyCode.Space:return "空格";
            case KeyCode.LeftArrow:return "←";
            case KeyCode.RightArrow:return "→";
            case KeyCode.UpArrow:return "↑";
            case KeyCode.DownArrow:return "↓";
            case KeyCode.LeftShift:return "左Shift";
            case KeyCode.RightShift:return "右Shift";
            case KeyCode.LeftControl:return "左Ctrl";
            case KeyCode.RightControl:return "右Ctrl";
            case KeyCode.LeftAlt:return "左Alt";
            case KeyCode.RightAlt:return "右Alt";
            case KeyCode.Return:return "Enter";
            case KeyCode.KeypadEnter:return "小键盘Enter";
            case KeyCode.Backspace:return "退格";
            case KeyCode.CapsLock:return "CapsLock";
            default:
                string name=key.ToString();
                if(name.StartsWith("Alpha"))return name.Substring(5);
                if(name.StartsWith("Keypad"))return "小键盘"+name.Substring(6);
                return name;
        }
    }
}
