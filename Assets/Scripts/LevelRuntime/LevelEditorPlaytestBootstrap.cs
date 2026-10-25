using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;

// Present only in the copied Level1 playtest Scene. The original game scripts and Scene stay intact.
[DefaultExecutionOrder(-10000)]
public sealed class LevelEditorPlaytestBootstrap : MonoBehaviour
{
    [Serializable] public sealed class PositionEdit { public string objectId; public Vector3 localPosition; }
    [Serializable] public sealed class Overlay
    {
        public int overlayVersion;
        public string roomId, sourceSceneSha256, levelId;
        public PositionEdit[] positions;
    }
    [Serializable] public sealed class Receipt
    {
        public string status, sessionId, sourceSceneSha256, error;
        public int appliedCount;
        public PositionEdit[] positions;
    }

    [SerializeField] string roomId = "room1";
    [SerializeField] string levelId;
    [SerializeField] string sourceSceneSha256;
    [SerializeField] string[] allowedObjectIds;

    public void Configure(string level, string sceneSha, string[] ids)
    {
        levelId = level;
        sourceSceneSha256 = sceneSha;
        allowedObjectIds = ids;
    }

    static string Argument(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == name) return args[i + 1];
        return null;
    }

    static string Sha256(byte[] bytes)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }

    static bool Finite(float n) => !float.IsNaN(n) && !float.IsInfinity(n) && Mathf.Abs(n) <= 1000000f;

    void Awake()
    {
        string sessionId = Argument("-pleSession"), receiptPath = Argument("-pleReceipt");
        try
        {
            if (Application.companyName != "MiniGame Team Phase4A Test" ||
                Application.productName != "Physics Level Editor Phase4A Isolated")
                throw new InvalidDataException("Playtest Player is not save-isolated");
            if (SceneManager.GetActiveScene().name != "Level1" || roomId != "room1" ||
                string.IsNullOrEmpty(levelId) || string.IsNullOrEmpty(sourceSceneSha256))
                throw new InvalidDataException("Unexpected playtest Scene identity");
            string path = Argument("-pleOverlay"), expectedHash = Argument("-pleSha256");
            if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(expectedHash) ||
                string.IsNullOrEmpty(receiptPath) || string.IsNullOrEmpty(sessionId))
                throw new InvalidDataException("Missing playtest launch arguments");
            byte[] bytes = File.ReadAllBytes(path);
            if (!string.Equals(Sha256(bytes), expectedHash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Overlay SHA-256 changed after editor validation");
            Overlay overlay = JsonUtility.FromJson<Overlay>(Encoding.UTF8.GetString(bytes));
            if (overlay == null || overlay.overlayVersion != 1 || overlay.roomId != roomId ||
                overlay.levelId != levelId || overlay.sourceSceneSha256 != sourceSceneSha256 ||
                overlay.positions == null)
                throw new InvalidDataException("Overlay version, room or source Scene does not match Player");
            var allowed = new HashSet<string>(allowedObjectIds ?? Array.Empty<string>(), StringComparer.Ordinal);
            var markers = FindObjectsOfType<LevelObjectId>(true);
            var targets = new Dictionary<string, LevelObjectId>(StringComparer.Ordinal);
            foreach (var marker in markers)
            {
                if (marker.gameObject.scene != gameObject.scene) continue;
                if (string.IsNullOrEmpty(marker.ObjectId) || !allowed.Contains(marker.ObjectId) ||
                    targets.ContainsKey(marker.ObjectId))
                    throw new InvalidDataException("Unexpected or duplicate baked object ID: " + marker.ObjectId);
                targets.Add(marker.ObjectId, marker);
            }
            if (targets.Count != allowed.Count)
                throw new InvalidDataException("Baked object ID inventory is incomplete");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var edit in overlay.positions)
            {
                if (edit == null || string.IsNullOrEmpty(edit.objectId) || !seen.Add(edit.objectId) ||
                    !targets.ContainsKey(edit.objectId) || !Finite(edit.localPosition.x) ||
                    !Finite(edit.localPosition.y) || !Finite(edit.localPosition.z))
                    throw new InvalidDataException("Invalid or unsupported position edit: " + edit?.objectId);
            }
            // All edits are checked before any Transform is changed.
            foreach (var edit in overlay.positions)
                targets[edit.objectId].transform.localPosition = edit.localPosition;
            Physics2D.SyncTransforms();
            var actual = overlay.positions.Select(edit => new PositionEdit {
                objectId = edit.objectId, localPosition = targets[edit.objectId].transform.localPosition
            }).ToArray();
            for (int i = 0; i < actual.Length; i++)
                if ((actual[i].localPosition - overlay.positions[i].localPosition).sqrMagnitude > 0.000001f)
                    throw new InvalidDataException("Position readback differs for " + actual[i].objectId);
            WriteReceipt(receiptPath, new Receipt { status = "applied", sessionId = sessionId,
                sourceSceneSha256 = sourceSceneSha256, appliedCount = actual.Length, positions = actual });
            Debug.Log("PLE_PLAYTEST_APPLIED room=room1 count=" + actual.Length + " session=" + sessionId);
        }
        catch (Exception error)
        {
            Debug.LogError("PLE_PLAYTEST_REJECTED " + error);
            try { if (!string.IsNullOrEmpty(receiptPath)) WriteReceipt(receiptPath,
                new Receipt { status = "rejected", sessionId = sessionId,
                    sourceSceneSha256 = sourceSceneSha256, error = error.Message,
                    appliedCount = 0, positions = Array.Empty<PositionEdit>() }); }
            catch (Exception writeError) { Debug.LogError("PLE_RECEIPT_WRITE_FAILED " + writeError); }
            Application.Quit(2);
        }
    }

    static void WriteReceipt(string path, Receipt receipt)
    {
        string directory = Path.GetDirectoryName(path);
        if (string.IsNullOrEmpty(directory) || !Directory.Exists(directory))
            throw new DirectoryNotFoundException("Playtest receipt directory is missing");
        string temp = path + ".tmp";
        File.WriteAllText(temp, JsonUtility.ToJson(receipt, true), new UTF8Encoding(false));
        if (File.Exists(path)) throw new IOException("Playtest receipt already exists");
        File.Move(temp, path);
    }
}
