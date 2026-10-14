using System.Collections;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Minigame.Tests
{
    // Exercises real input actions, FixedUpdate and 2D collision in the A scene.
    public sealed class PlayerSmokeTests
    {
        private Keyboard keyboard;
        private PlayerMotor2D motor;
        private Rigidbody2D body;
        private InputSettings originalSettings;
        private InputSettings testSettings;

        [UnitySetUp]
        public IEnumerator OpenSandbox()
        {
            // Batch mode has no focused Game view. Scope this override to tests.
            originalSettings = InputSystem.settings;
            testSettings = Object.Instantiate(originalSettings);
            testSettings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
#if UNITY_EDITOR
            testSettings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
#endif
            InputSystem.settings = testSettings;
            keyboard = InputSystem.AddDevice<Keyboard>();
            yield return SceneManager.LoadSceneAsync("A_GameplayTest");
            motor = Object.FindAnyObjectByType<PlayerMotor2D>();
            Assert.That(motor, Is.Not.Null);
            body = motor.GetComponent<Rigidbody2D>();
            yield return Steps(30);
            Assert.That(motor.IsGrounded, Is.True, "Player should settle on the ground.");
        }

        [UnityTearDown]
        public IEnumerator RemoveTestKeyboard()
        {
            if (keyboard != null)
                InputSystem.RemoveDevice(keyboard);
            InputSystem.settings = originalSettings;
            Object.Destroy(testSettings);
            yield return null;
        }

        [UnityTest]
        public IEnumerator MoveStopOppositeKeysAndCameraFollow()
        {
            CaptureScene();
            float startX = body.position.x;
            float cameraX = Camera.main.transform.position.x;
            QueueKeys(Key.D);
            yield return null;
            yield return Steps(15);
            Assert.That(body.position.x, Is.GreaterThan(startX + 1f));
            Assert.That(Camera.main.transform.position.x, Is.GreaterThan(cameraX + 0.5f));
            QueueKeys();
            yield return null;
            yield return Steps(2);
            Assert.That(Mathf.Abs(body.linearVelocity.x), Is.LessThan(0.01f));
            QueueKeys(Key.A, Key.D);
            yield return null;
            yield return Steps(2);
            Assert.That(Mathf.Abs(body.linearVelocity.x), Is.LessThan(0.01f));
            QueueKeys(Key.A);
            yield return null;
            yield return Steps(2);
            Assert.That(body.linearVelocity.x, Is.LessThan(-6f));
        }

        [UnityTest]
        public IEnumerator SingleJumpIgnoresAirPressAndRearmsOnLanding()
        {
            QueueKeys(Key.Space);
            yield return null;
            yield return Steps(2);
            Assert.That(body.linearVelocity.y, Is.GreaterThan(8f));
            Assert.That(motor.IsGrounded, Is.False);
            QueueKeys();
            yield return null;
            yield return Steps(2);
            float beforeSecondPress = body.linearVelocity.y;
            QueueKeys(Key.Space);
            yield return null;
            yield return Steps(2);
            Assert.That(body.linearVelocity.y, Is.LessThan(beforeSecondPress), "Midair press must not restart the jump.");
            // Hold the button through landing: no automatic repeat jump.
            yield return Steps(65);
            Assert.That(motor.IsGrounded, Is.True);
            Assert.That(Mathf.Abs(body.linearVelocity.y), Is.LessThan(0.1f));
            QueueKeys();
            yield return null;
            yield return Steps(2);
            QueueKeys(Key.W);
            yield return null;
            yield return Steps(2);
            Assert.That(body.linearVelocity.y, Is.GreaterThan(8f));
        }

        [UnityTest]
        public IEnumerator WallIsNotGroundAndCeilingBlocksJump()
        {
            // Beside Wall, feet above the floor: side contact cannot rearm jumping.
            body.position = new Vector2(15.05f, 1f);
            body.linearVelocity = Vector2.zero;
            yield return Steps(2);
            QueueKeys(Key.D, Key.Space);
            yield return null;
            yield return Steps(4);
            Assert.That(motor.IsGrounded, Is.False);
            Assert.That(body.linearVelocity.y, Is.LessThan(0f));
            Assert.That(body.position.x, Is.LessThan(15.2f), "Wall collision must block horizontal motion.");
            QueueKeys();
            body.position = new Vector2(-5f, 0f);
            body.linearVelocity = Vector2.zero;
            yield return Steps(20);
            Assert.That(motor.IsGrounded, Is.True);
            QueueKeys(Key.Space);
            yield return null;
            yield return Steps(25);
            Assert.That(body.position.y, Is.LessThan(1.1f), "Head must stay below LowCeiling.");
            Assert.That(motor.IsGrounded, Is.True);
        }

        [UnityTest]
        public IEnumerator SandboxResetClearsVelocityAndFallResets()
        {
            body.position = new Vector2(10f, 1f);
            body.linearVelocity = new Vector2(5f, -5f);
            QueueKeys(Key.R);
            yield return null;
            yield return null;
            yield return Steps(2);
            Assert.That(Mathf.Abs(body.position.x), Is.LessThan(0.05f));
            Assert.That(Mathf.Abs(body.linearVelocity.x), Is.LessThan(0.01f));
            QueueKeys();
            yield return null;
            body.position = new Vector2(-13f, -9f);
            body.linearVelocity = new Vector2(2f, -10f);
            yield return null;
            yield return null;
            yield return Steps(2);
            Assert.That(Mathf.Abs(body.position.x), Is.LessThan(0.05f));
            Assert.That(body.position.y, Is.GreaterThan(-1f));
        }

        private void QueueKeys(params Key[] keys) => InputSystem.QueueStateEvent(keyboard, new KeyboardState(keys));

        private static IEnumerator Steps(int count)
        {
            for (int i = 0; i < count; i++)
                yield return new WaitForFixedUpdate();
        }

        private static void CaptureScene()
        {
            string folder = Path.GetFullPath(Path.Combine(Application.dataPath, "../../Verification"));
            Directory.CreateDirectory(folder);
            var camera = Camera.main;
            var target = new RenderTexture(1280, 720, 24);
            RenderTexture previous = RenderTexture.active;
            RenderTexture previousTarget = camera.targetTexture;
            camera.targetTexture = target;
            camera.Render();
            RenderTexture.active = target;
            var image = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            image.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
            image.Apply();
            File.WriteAllBytes(Path.Combine(folder, "T02-scene.png"), image.EncodeToPNG());
            camera.targetTexture = previousTarget;
            RenderTexture.active = previous;
            target.Release();
            Object.Destroy(target);
            Object.Destroy(image);
        }
    }
}
