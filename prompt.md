You are analyzing a still frame from a broadcast television feed of a professional football (soccer) match. For every player visible in the image, estimate their position on the pitch in real-world meters.

## Pitch coordinate system

- The pitch is 105 meters long (x axis) by 68 meters wide (y axis).
- The origin (0, 0) is at the center of the pitch (intersection of the halfway line and the midfield line).
- Valid x range: [-52.5, +52.5]. Valid y range: [-34, +34].
- The broadcast camera is positioned on the near touchline. The near touchline is at y = +34. So +Y points toward the near touchline (the bottom of the image); -Y points toward the far touchline (the top of the image).
- +X points toward the goal on the right side of the image when the center of the pitch is visible. When the camera has panned or zoomed onto one half of the pitch, use visible pitch markings (halfway line, penalty areas, goal lines, corner arcs) to determine which half you are looking at, and orient your coordinates accordingly. The left goal sits near x = -52.5; the right goal sits near x = +52.5.

## What to include

- Every outfield player and goalkeeper visible in the image.
- Use each player's ground-contact point (approximately where their feet meet the pitch) for the (x, y) position.
- Do NOT include referees, coaches, medical staff, or people in the stands.
- Do NOT include players who are fully occluded or out of frame.

## Output format

Return a JSON array and nothing else. No prose, no explanations, no markdown fences. Each element is an object with these fields:

- `x`: number, pitch x-coordinate in meters
- `y`: number, pitch y-coordinate in meters
- `role`: string, either `"player"` or `"goalkeeper"`
- `team`: string, either `"left"` (the team defending the x = -52.5 goal) or `"right"` (the team defending the x = +52.5 goal)

If no players are visible, return `[]`.
