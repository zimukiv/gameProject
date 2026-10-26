using System;
using UnityEngine;
using Control=RoomLabKeyBindings.ActionId;

// Run by the connected build, without changing the user's saved preferences.
public static class RoomLabKeyBindingsCheck
{
    private static int checks;
    private static void Check(bool value,string message)
    {if(!value)throw new Exception("KEY_BINDINGS_FAIL "+message);checks++;}
    public static void Run()
    {
        checks=0;
        var b=new RoomLabKeyBindings();string message;
        Check(b.IsActive(Control.Left,k=>k==KeyCode.A),"Default A");
        Check(b.IsActive(Control.Left,k=>k==KeyCode.LeftArrow),"Default left arrow");
        foreach(var key in new[]{KeyCode.Space,KeyCode.W,KeyCode.UpArrow})
            Check(b.IsActive(Control.Jump,k=>k==key),"Default jump aliases");
        foreach(var key in new[]{KeyCode.LeftShift,KeyCode.RightShift})
            Check(b.IsActive(Control.Dash,k=>k==key),"Default shift keys");
        Check(b.TryBind(Control.Left,0,KeyCode.J,out message),"Rebind left to J");
        Check(b.IsActive(Control.Left,k=>k==KeyCode.J),"New left key active");
        Check(!b.IsActive(Control.Left,k=>k==KeyCode.A),"Old A must stop working");
        Check(b.TryBind(Control.Left,1,KeyCode.None,out message),"Clear backup");
        Check(!b.IsActive(Control.Left,k=>k==KeyCode.LeftArrow),"Removed arrow must not leak through aliases");
        string before=b.ToJson();
        Check(!b.TryBind(Control.Right,0,KeyCode.J,out message),"Reject duplicate across actions");
        Check(!b.TryBind(Control.Jump,1,KeyCode.Space,out message),"Reject duplicate within action");
        Check(!b.TryBind(Control.Left,0,KeyCode.None,out message),"Preserve last assigned key");
        foreach(var key in new[]{KeyCode.Escape,KeyCode.Mouse0,KeyCode.JoystickButton0,(KeyCode)9999})
            Check(!b.TryBind(Control.Left,0,key,out message),"Reject non-binding key "+key);
        Check(b.ToJson()==before,"Rejected changes must not modify configuration");
        foreach(Control action in Enum.GetValues(typeof(Control)))
        {
            var custom=new RoomLabKeyBindings();
            Check(custom.TryBind(action,0,KeyCode.F8,out message),"Rebind action "+action);
            Check(custom.IsActive(action,k=>k==KeyCode.F8),"Read remapped action "+action);
            Check(custom.HelpText().Contains("F8"),"Dynamic help "+action);
        }
        var loaded=new RoomLabKeyBindings();
        Check(loaded.TryLoadJson(b.ToJson()),"Load saved settings");
        Check(loaded.ToJson()==b.ToJson(),"Persistence round trip");
        foreach(string invalid in new[]{"", "{", "{}", "null", b.ToJson().Replace("\"version\":1","\"version\":99"),
            b.ToJson().Replace("\"action\":1","\"action\":0"),
            b.ToJson().Replace("\"keys\":[106,0,0]","\"keys\":[27,0,0]")})
        {
            string stable=loaded.ToJson();
            Check(!loaded.TryLoadJson(invalid),"Reject invalid saved settings: "+invalid);
            Check(loaded.ToJson()==stable,"Invalid load must be atomic");
        }
        loaded.ResetDefaults();var defaults=new RoomLabKeyBindings();
        Check(loaded.ToJson()==defaults.ToJson(),"Restore defaults");
        Debug.Log("KEY_BINDINGS_PASS checks="+checks+" actions=7 slots=3 defaults=true remap=true oldKeysDisabled=true conflictGuard=true reservedEsc=true minimumOneKey=true persistence=true invalidSaveFallback=true restoreDefaults=true");
    }
}
