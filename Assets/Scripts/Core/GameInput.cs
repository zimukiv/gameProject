using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
#endif

/// <summary>Shared keyboard input for both Unity input backends.</summary>
public static class GameInput
{
#if ENABLE_INPUT_SYSTEM
    private static readonly System.Collections.Generic.Dictionary<KeyCode, Key> keyMappings =
        new System.Collections.Generic.Dictionary<KeyCode, Key>();
#endif
    public static bool IsHeld(KeyCode key) => Read(key, false);
    public static bool WasPressed(KeyCode key) => Read(key, true);
    // Rebindable controls must read the chosen physical key without legacy aliases.
    public static bool IsHeldExact(KeyCode key) => ReadSingle(key, false);
    public static bool WasPressedExact(KeyCode key) => ReadSingle(key, true);

    private static bool Read(KeyCode key, bool pressedThisFrame)
    {
        if (ReadSingle(key, pressedThisFrame)) return true;
        switch (key)
        {
            case KeyCode.A: return ReadSingle(KeyCode.LeftArrow, pressedThisFrame);
            case KeyCode.D: return ReadSingle(KeyCode.RightArrow, pressedThisFrame);
            case KeyCode.W: return ReadSingle(KeyCode.UpArrow, pressedThisFrame);
            case KeyCode.S: return ReadSingle(KeyCode.DownArrow, pressedThisFrame);
            case KeyCode.LeftShift: return ReadSingle(KeyCode.RightShift, pressedThisFrame);
            default: return false;
        }
    }

    private static bool ReadSingle(KeyCode key, bool pressedThisFrame)
    {
#if ENABLE_INPUT_SYSTEM
        var keyboard = Keyboard.current;
        if (keyboard != null)
        {
            Key inputKey;
            if (!keyMappings.TryGetValue(key, out inputKey))
            {
                switch (key)
                {
                    case KeyCode.Return: inputKey = Key.Enter; break;
                    case KeyCode.KeypadEnter: inputKey = Key.NumpadEnter; break;
                    case KeyCode.LeftControl: inputKey = Key.LeftCtrl; break;
                    case KeyCode.RightControl: inputKey = Key.RightCtrl; break;
                    case KeyCode.LeftCommand:
                    case KeyCode.LeftWindows: inputKey = Key.LeftMeta; break;
                    case KeyCode.RightCommand:
                    case KeyCode.RightWindows: inputKey = Key.RightMeta; break;
                    default:
                        string name = key.ToString();
                        if (name.StartsWith("Alpha")) name = "Digit" + name.Substring(5);
                        else if (name.StartsWith("Keypad")) name = "Numpad" + name.Substring(6);
                        if (!System.Enum.TryParse(name, true, out inputKey)) inputKey = Key.None;
                        break;
                }
                keyMappings[key] = inputKey;
            }
            if (inputKey == Key.None) return false;
            KeyControl control = keyboard[inputKey];
            return pressedThisFrame ? control.wasPressedThisFrame : control.isPressed;
        }
#endif
#if ENABLE_LEGACY_INPUT_MANAGER || !ENABLE_INPUT_SYSTEM
        return pressedThisFrame ? Input.GetKeyDown(key) : Input.GetKey(key);
#else
        return false;
#endif
    }
}
