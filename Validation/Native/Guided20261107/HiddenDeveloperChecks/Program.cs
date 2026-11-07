using System;
using System.IO;
using System.Collections.Generic;
using System.Text.Json;
using RoomLab.Native;
using D = RoomLab.Native.NativeHiddenDirection;

class Program
{
    static readonly D[] Sequence = { D.Up, D.Up, D.Down, D.Down, D.Left, D.Right, D.Left, D.Right };
    static readonly List<object> evidence = new List<object>();
    static int checks, failures;
    static void Check(bool pass, string name)
    {
        checks++; if (!pass) failures++;
        evidence.Add(new { name, pass }); Console.WriteLine((pass ? "PASS " : "FAIL ") + name);
    }
    static bool Complete(NativeHiddenDeveloperSequence s, ref double t, double gap = .1)
    {
        bool result = false; foreach (D d in Sequence) { t += gap; result = s.Push(d, t); } return result;
    }
    static void Main()
    {
        foreach (double gap in new[] { 0.0, .2, 2.0 })
        {
            var s = new NativeHiddenDeveloperSequence(); double t = 10;
            for (int i = 0; i < Sequence.Length; i++)
            {
                bool result = s.Push(Sequence[i], t); t += gap;
                Check(result == (i == 7) && s.Progress == (i == 7 ? 0 : i + 1), "ordered edge " + (i + 1) + " with gap " + gap);
            }
        }
        for (int timeoutAt = 1; timeoutAt < 8; timeoutAt++)
        {
            var s = new NativeHiddenDeveloperSequence(); double t = 0; bool opened = false;
            for (int i = 0; i < 8; i++) { t += i == timeoutAt ? 2.001 : .1; opened |= s.Push(Sequence[i], t); }
            Check(!opened, "timeout rejects partial sequence at edge " + (timeoutAt + 1));
        }
        for (int wrongAt = 0; wrongAt < 8; wrongAt++)
        {
            var s = new NativeHiddenDeveloperSequence(); double t = 0; bool opened = false;
            for (int i = 0; i < 8; i++) { t += .1; opened |= s.Push(i == wrongAt ? D.Other : Sequence[i], t); }
            Check(!opened, "non-arrow/wrong key interrupts at edge " + (wrongAt + 1));
            Check(Complete(s, ref t), "fresh exact sequence succeeds after wrong edge " + (wrongAt + 1));
        }
        for (int prefix = 1; prefix < 8; prefix++)
        {
            var s = new NativeHiddenDeveloperSequence(); double t = 0;
            for (int i = 0; i < prefix; i++) { t += .1; s.Push(Sequence[i], t); }
            s.Reset(); bool opened = false;
            for (int i = prefix; i < 8; i++) { t += .1; opened |= s.Push(Sequence[i], t); }
            Check(!opened, "explicit modal reset discards prefix length " + prefix);
        }
        foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity, -1.0 })
        {
            var s = new NativeHiddenDeveloperSequence(); s.Push(D.Up, 1);
            Check(!s.Push(D.Up, invalid) && s.Progress == 0, "invalid clock value resets: " + invalid);
        }
        {
            var s = new NativeHiddenDeveloperSequence(); s.Push(D.Up, 1); s.Push(D.Up, 1.1); s.Push(D.Up, 1.2);
            Check(s.Progress == 1, "wrong Up starts a new one-edge prefix");
            bool opened = false; double t = 1.2;
            for (int i = 1; i < 8; i++) { t += .1; opened = s.Push(Sequence[i], t); }
            Check(opened && s.Progress == 0, "restart prefix completes only with the remaining seven edges");
        }
        {
            var s = new NativeHiddenDeveloperSequence(); s.Push(D.Up, 1); s.Push(D.Up, 3.01);
            Check(s.Progress == 1, "timed out Up begins a fresh prefix");
            Check(!s.Push(D.Down, 3.1) && s.Progress == 0, "one fresh Up cannot substitute for two Up presses");
            s.Push(D.Up, 10); Check(!s.Push(D.Down, 9) && s.Progress == 0, "backward clock never completes an old prefix");
            Check(!s.Push((D)999, 10) && s.Progress == 0, "unknown direction resets");
            double t = 20; Check(Complete(s, ref t), "first complete sequence opens once");
            Check(Complete(s, ref t), "second complete sequence can open again");
        }
        string path = "Validation/Native/Guided20261107/HiddenDeveloperChecks/results.json";
        File.WriteAllText(path, JsonSerializer.Serialize(new { checks, failures, scope = "Pure state-machine key-down edges, not physical-human or Unity UI evidence", results = evidence }, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine("HIDDEN_DEVELOPER_SEQUENCE checks=" + checks + " failures=" + failures);
        Environment.ExitCode = failures == 0 ? 0 : 1;
    }
}
