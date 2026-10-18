"""Independent geometry audit of the Unity scene generator. Run with Python 3."""
from pathlib import Path
import re


SOURCE = Path(__file__).resolve().parents[1] / "Assets/Editor/MiniGameAutoSetup.cs"
text = SOURCE.read_text(encoding="utf-8")


def position(name: str) -> tuple[float, float]:
    pattern = rf'"{re.escape(name)}", new Vector2\(([-\d.]+)f?, ([-\d.]+)f?\)'
    match = re.search(pattern, text)
    if not match:
        raise AssertionError(f"Missing positioned object: {name}")
    return float(match[1]), float(match[2])


def ground(name: str) -> tuple[float, float]:
    pattern = rf'"{re.escape(name)}", new Vector2\(([-\d.]+)f?, ([-\d.]+)f?\), new Vector2\(([-\d.]+)f?, ([-\d.]+)f?\)'
    match = re.search(pattern, text)
    if not match:
        raise AssertionError(f"Missing ground: {name}")
    center, width = float(match[1]), float(match[3])
    return center - width / 2, center + width / 2


grounds = [ground(name) for name in ("Start ground", "Middle ground", "Finish ground")]
player_x = position("Player")[0]
first_cp = position("Room 2 checkpoint")[0]
activator_x = position("AI activation device")[0]
second_cp = position("Room 3 checkpoint")[0]
goal_x = position("Exit")[0]

assert player_x < first_cp < activator_x < second_cp < goal_x, "Level flow is out of order"
for name, x in (("player", player_x), ("first checkpoint", first_cp),
                ("second checkpoint", second_cp), ("goal", goal_x)):
    assert any(left + 0.35 < x < right - 0.35 for left, right in grounds), f"{name} is over a pit"

# Same-height jump range from the values assigned by the scene generator.
def assigned_float(name: str) -> float:
    match = re.search(rf'{re.escape(name)}\s*=\s*([\d.]+)f?;', text)
    if not match:
        raise AssertionError(f"Missing tuning value: {name}")
    return float(match[1])


run_speed = assigned_float("controller.moveSpeed")
jump_speed = assigned_float("controller.jumpVelocity")
gravity = assigned_float("body.gravityScale") * 9.81
jump_range = run_speed * (2 * jump_speed / gravity)
for (_, right), (left, _) in zip(grounds, grounds[1:]):
    assert left - right < jump_range * 0.8, f"Ground gap {left-right:.2f}m exceeds safe jump range"

print(f"Geometry passes: 3 ground sections, two safe checkpoints, max jump range {jump_range:.2f} m")
