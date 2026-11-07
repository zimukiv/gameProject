using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        readonly NativeHiddenDeveloperSequence hiddenDeveloperSequence = new NativeHiddenDeveloperSequence();
        static readonly KeyCode[] HiddenDeveloperKeyboardKeys = HiddenKeyboardKeys();

        static KeyCode[] HiddenKeyboardKeys()
        {
            var result = new List<KeyCode>();
            foreach (KeyCode key in Enum.GetValues(typeof(KeyCode)))
                if (key != KeyCode.None && (int)key < (int)KeyCode.Mouse0 && !result.Contains(key)) result.Add(key);
            return result.ToArray();
        }

        bool HiddenDeveloperInputAllowed => Game != null && !Game.AwaitingSaveChoice && !IsSaveSlotPage &&
            rebind < 0 && (page == "menu" || page == "play" || page == "pause");

        // The live input path and runtime acceptance both enter here. Each call is a key-down edge.
        // No WASD aliases: only the four explicit physical Arrow KeyCodes advance the sequence.
        bool FeedHiddenDeveloperKey(KeyCode key, float time)
        {
            if (!HiddenDeveloperInputAllowed) { hiddenDeveloperSequence.Reset(); return false; }
            NativeHiddenDirection direction;
            switch (key)
            {
                case KeyCode.UpArrow: direction = NativeHiddenDirection.Up; break;
                case KeyCode.DownArrow: direction = NativeHiddenDirection.Down; break;
                case KeyCode.LeftArrow: direction = NativeHiddenDirection.Left; break;
                case KeyCode.RightArrow: direction = NativeHiddenDirection.Right; break;
                default: direction = NativeHiddenDirection.Other; break;
            }
            if (!hiddenDeveloperSequence.Push(direction, time)) return false;
            // The caller returns from Update on true; also discard buffered gameplay edges/held state.
            keys?.Clear(); timeline.Reset();
            OpenHiddenDeveloper();
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
            return true;
        }

        bool HandleHiddenDeveloperInput()
        {
            if (!HiddenDeveloperInputAllowed || !Application.isFocused) { hiddenDeveloperSequence.Reset(); return false; }
            KeyCode edge = KeyCode.None;
            foreach (var key in HiddenDeveloperKeyboardKeys)
            {
                if (!GameInput.WasPressedExact(key)) continue;
                // Simultaneous keys have no unambiguous order; they must never manufacture a code.
                if (edge != KeyCode.None) { hiddenDeveloperSequence.Reset(); return false; }
                edge = key;
            }
            return edge != KeyCode.None && FeedHiddenDeveloperKey(edge, Time.unscaledTime);
        }
    }
}
