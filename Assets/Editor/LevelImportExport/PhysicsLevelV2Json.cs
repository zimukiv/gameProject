using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

// Small strict JSON DOM for the Phase 4 editor boundary. It rejects duplicate keys and invalid JSON
// before JsonUtility can silently discard data. It has no Unity or package dependency.
internal static class PhysicsLevelV2Json
{
    internal sealed class Node
    {
        internal object Value;
        internal Node(object value) { Value = value; }
        internal Dictionary<string, Node> Object => Value as Dictionary<string, Node>;
        internal List<Node> Array => Value as List<Node>;
        internal string String => Value as string;
        internal bool IsNull => Value == null;
    }

    internal static Node Parse(string json) => new Reader(json).Read();

    internal static string Write(Node node)
    {
        var output = new StringBuilder();
        WriteValue(output, node);
        return output.ToString();
    }

    internal static Node Obj(params object[] pairs)
    {
        var values = new Dictionary<string, Node>(StringComparer.Ordinal);
        for (int i = 0; i < pairs.Length; i += 2) values.Add((string)pairs[i], Wrap(pairs[i + 1]));
        return new Node(values);
    }
    internal static Node Arr(IEnumerable<Node> values) => new Node(new List<Node>(values));
    internal static Node Wrap(object value) => value is Node node ? node : new Node(value);

    private static void WriteValue(StringBuilder output, Node node)
    {
        if (node == null || node.Value == null) { output.Append("null"); return; }
        if (node.Object != null)
        {
            output.Append('{'); bool first = true;
            foreach (var pair in node.Object)
            {
                if (!first) output.Append(','); first = false;
                WriteString(output, pair.Key); output.Append(':'); WriteValue(output, pair.Value);
            }
            output.Append('}'); return;
        }
        if (node.Array != null)
        {
            output.Append('['); bool first = true;
            foreach (var item in node.Array) { if (!first) output.Append(','); first = false; WriteValue(output, item); }
            output.Append(']'); return;
        }
        if (node.Value is string text) { WriteString(output, text); return; }
        if (node.Value is bool boolean) { output.Append(boolean ? "true" : "false"); return; }
        if (node.Value is double number)
        {
            if (double.IsNaN(number) || double.IsInfinity(number)) throw new InvalidDataException("Non-finite JSON number.");
            output.Append(number.ToString("R", CultureInfo.InvariantCulture)); return;
        }
        throw new InvalidDataException("Unsupported JSON value type: " + node.Value.GetType().Name);
    }

    private static void WriteString(StringBuilder output, string value)
    {
        output.Append('"');
        foreach (char c in value)
        {
            switch (c)
            {
                case '"': output.Append("\\\""); break;
                case '\\': output.Append("\\\\"); break;
                case '\n': output.Append("\\n"); break;
                case '\r': output.Append("\\r"); break;
                case '\t': output.Append("\\t"); break;
                default:
                    if (c < 32) output.Append("\\u").Append(((int)c).ToString("x4"));
                    else output.Append(c);
                    break;
            }
        }
        output.Append('"');
    }

    private sealed class Reader
    {
        private readonly string source;
        private int index;
        internal Reader(string value) { source = value ?? throw new InvalidDataException("JSON is null."); }
        internal Node Read()
        {
            Skip(); var node = Value("$"); Skip();
            if (index != source.Length) Error("$", "trailing content");
            return node;
        }
        private Node Value(string path)
        {
            Skip(); if (index == source.Length) Error(path, "unexpected end");
            char c = source[index];
            if (c == '{') return Object(path);
            if (c == '[') return Array(path);
            if (c == '"') return new Node(String(path));
            if (c == 't' && Literal("true")) return new Node(true);
            if (c == 'f' && Literal("false")) return new Node(false);
            if (c == 'n' && Literal("null")) return new Node(null);
            if (c == '-' || c >= '0' && c <= '9') return Number(path);
            Error(path, "invalid value"); return null;
        }
        private Node Object(string path)
        {
            index++; var map = new Dictionary<string, Node>(StringComparer.Ordinal); Skip();
            if (Take('}')) return new Node(map);
            while (true)
            {
                Skip();
                if (index == source.Length || source[index] != '"') Error(path, "expected property name");
                string key = String(path); Skip(); Expect(':', path);
                string child = path + "." + key;
                if (map.ContainsKey(key)) Error(child, "duplicate JSON key");
                map.Add(key, Value(child)); Skip();
                if (Take('}')) break;
                Expect(',', path);
            }
            return new Node(map);
        }
        private Node Array(string path)
        {
            index++; var list = new List<Node>(); Skip();
            if (Take(']')) return new Node(list);
            while (true)
            {
                list.Add(Value(path + "[" + list.Count + "]")); Skip();
                if (Take(']')) break;
                Expect(',', path);
            }
            return new Node(list);
        }
        private string String(string path)
        {
            index++; var result = new StringBuilder();
            while (index < source.Length)
            {
                char c = source[index++];
                if (c == '"') return result.ToString();
                if (c < 32) Error(path, "control character in string");
                if (c != '\\')
                {
                    if (char.IsHighSurrogate(c))
                    {
                        if (index >= source.Length || !char.IsLowSurrogate(source[index])) Error(path, "unpaired surrogate");
                        result.Append(c).Append(source[index++]);
                    }
                    else if (char.IsLowSurrogate(c)) Error(path, "unpaired surrogate");
                    else result.Append(c);
                    continue;
                }
                if (index >= source.Length) Error(path, "unfinished escape");
                c = source[index++];
                switch (c)
                {
                    case '"': result.Append('"'); break;
                    case '\\': result.Append('\\'); break;
                    case '/': result.Append('/'); break;
                    case 'b': result.Append('\b'); break;
                    case 'f': result.Append('\f'); break;
                    case 'n': result.Append('\n'); break;
                    case 'r': result.Append('\r'); break;
                    case 't': result.Append('\t'); break;
                    case 'u':
                        ushort unicode = 0;
                        if (index + 4 > source.Length || !ushort.TryParse(source.Substring(index, 4), NumberStyles.HexNumber,
                            CultureInfo.InvariantCulture, out unicode)) Error(path, "invalid unicode escape");
                        index += 4;
                        if (char.IsHighSurrogate((char)unicode))
                        {
                            ushort low = 0;
                            if (index + 6 > source.Length || source[index] != '\\' || source[index + 1] != 'u' ||
                                !ushort.TryParse(source.Substring(index + 2, 4), NumberStyles.HexNumber,
                                    CultureInfo.InvariantCulture, out low) || !char.IsLowSurrogate((char)low))
                                Error(path, "invalid surrogate pair");
                            result.Append((char)unicode).Append((char)low); index += 6;
                        }
                        else if (char.IsLowSurrogate((char)unicode)) Error(path, "unpaired surrogate");
                        else result.Append((char)unicode);
                        break;
                    default: Error(path, "invalid escape"); break;
                }
            }
            Error(path, "unterminated string"); return null;
        }
        private Node Number(string path)
        {
            int start = index;
            if (Take('-') && index == source.Length) Error(path, "invalid number");
            if (Take('0')) { if (index < source.Length && char.IsDigit(source[index])) Error(path, "leading zero"); }
            else { if (index == source.Length || source[index] < '1' || source[index] > '9') Error(path, "invalid number"); Digits(); }
            if (Take('.')) { int before = index; Digits(); if (before == index) Error(path, "invalid fraction"); }
            if (Take('e') || Take('E'))
            {
                Take('+'); Take('-'); int before = index; Digits(); if (before == index) Error(path, "invalid exponent");
            }
            if (!double.TryParse(source.Substring(start, index - start), NumberStyles.Float,
                    CultureInfo.InvariantCulture, out double number) || double.IsInfinity(number)) Error(path, "invalid number");
            return new Node(number);
        }
        private void Digits() { while (index < source.Length && source[index] >= '0' && source[index] <= '9') index++; }
        private bool Literal(string value)
        {
            if (index + value.Length > source.Length || string.CompareOrdinal(source, index, value, 0, value.Length) != 0) return false;
            index += value.Length; return true;
        }
        private void Skip() { while (index < source.Length && (source[index] == ' ' || source[index] == '\n' || source[index] == '\r' || source[index] == '\t')) index++; }
        private bool Take(char c) { if (index >= source.Length || source[index] != c) return false; index++; return true; }
        private void Expect(char c, string path) { Skip(); if (!Take(c)) Error(path, "expected '" + c + "'"); }
        private static void Error(string path, string reason) { throw new InvalidDataException(path + ": " + reason); }
    }
}
