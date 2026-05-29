import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import PageToc from '../components/PageToc'

export default function Methodology() {
  const { hash } = useLocation()

  useEffect(() => {
    const render = () => {
      if (window.renderMathInElement) {
        window.renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
          ],
          throwOnError: false,
        })
      }
    }
    // KaTeX script may not have loaded yet
    if (window.renderMathInElement) render()
    else {
      const interval = setInterval(() => {
        if (window.renderMathInElement) { render(); clearInterval(interval) }
      }, 100)
      return () => clearInterval(interval)
    }
    // Scroll to hash target
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          el.classList.add('highlight-flash')
          setTimeout(() => el.classList.remove('highlight-flash'), 3000)
        }, 100)
      }
    }
  }, [hash])

  return (
    <section>
      <PageToc />
      <h1>Methodology</h1>

      <h2 id="task">Task</h2>
      <p>
        Each model receives a single broadcast still frame and a text prompt
        describing the pitch coordinate system. It must return a JSON array of
        <code className="inline">{`{x, y}`}</code> positions for every visible player
        (outfield + goalkeepers). No video context, no multi-frame tracking —
        just one image. Referees, coaches, and occluded players are excluded.
      </p>

      <h2 id="dataset">Dataset</h2>
      <p>
        385 frames from the{' '}
        <a href="https://www.soccer-net.org/" target="_blank" rel="noopener noreferrer">SoccerNet</a>{' '}
        Game State Reconstruction (SN-GSR) test + valid splits, sampled to ensure
        balanced representation across two dimensions:
      </p>
      <ul>
        <li><strong>3 camera directions</strong> — Left field (left goal visible),
          Mid field (neither goal), Right field (right goal visible)</li>
        <li><strong>4 player-count buckets</strong> — 0–5, 6–10, 11–15, 16+ visible players</li>
      </ul>
      <p>
        Frames are drawn from 100 distinct clips with even temporal spacing
        to avoid near-duplicate images.
      </p>

      <h2 id="coordinate-system">Coordinate system</h2>
      <p>
        The pitch is 105 m × 68 m. The origin (0, 0) is at the center of the pitch.
      </p>
      <ul>
        <li><strong>X</strong> ∈ [−52.5, +52.5] — left goal at −52.5, right goal at +52.5</li>
        <li><strong>Y</strong> ∈ [−34, +34] — far touchline at −34, near touchline (camera side) at +34</li>
      </ul>
      <p>
        The broadcast camera sits on the near touchline. Models must infer
        perspective geometry from visible pitch markings (lines, arcs, penalty areas)
        alone — no camera calibration is provided.
      </p>

      <h2 id="scoring">Scoring</h2>
      <p>
        We use <a href="https://arxiv.org/abs/1601.05585" target="_blank" rel="noopener noreferrer">GOSPA</a>{' '}
        (Generalized Optimal Sub-Pattern Assignment) with parameters
        {"$c = 30$"} m, {"$p = 1$"}, {"$\\alpha = 2$"}. Intuitively:
      </p>
      <ol>
        <li><strong>Match</strong> predicted points to ground-truth points via the{' '}
          <a href="https://en.wikipedia.org/wiki/Hungarian_algorithm" target="_blank" rel="noopener noreferrer">Hungarian algorithm</a>{' '}
          (optimal assignment minimizing total cost).</li>
        <li><strong>Matched pairs</strong> contribute their Euclidean distance (in meters).</li>
        <li><strong>Unmatched points</strong> — each missed player or hallucinated player
          costs {"$c / \\alpha = 15$"} m.</li>
        <li><strong>Threshold</strong> — pairs farther than {"$c = 30$"} m apart are never
          matched (leaving both unmatched is cheaper).</li>
      </ol>
      <div className="formula">
        {"$$\\text{GOSPA} \\;=\\; \\sum_{\\text{matched}} d_i \\;+\\; 15 \\times (n_{\\text{missed}} + n_{\\text{false}})$$"}
      </div>
      <p>What the parameters control:</p>
      <ul>
        <li><strong>{"$c = 30$"} m</strong> (cutoff distance) — if a predicted player is more than
          30 m from any ground-truth player, it's treated as a false detection rather than
          a bad localization. This is roughly a third of the pitch length — generous enough
          that only truly spurious predictions get cut off.</li>
        <li><strong>{"$p = 1$"}</strong> (order) — errors scale linearly with distance. A prediction
          that's 10 m off costs exactly twice as much as one that's 5 m off. (With {"$p = 2$"},
          large errors would be penalized quadratically.)</li>
        <li><strong>{"$\\alpha = 2$"}</strong> (cardinality weight) — controls the penalty for
          missing or hallucinating a player: {"$c / \\alpha = 15$"} m per unmatched point.
          This means missing a player is equivalent to localizing one 15 m away from
          its true position.</li>
      </ul>

      <h2 id="normalization">Normalization & aggregation</h2>
      <p>
        Raw GOSPA is divided by the number of ground-truth players in that frame
        so that crowded frames don't dominate the headline:
      </p>
      <div className="formula">
        {"$$\\text{score}_i \\;=\\; \\frac{\\text{GOSPA}_i}{\\max(n_{\\text{gt},\\,i},\\; 1)}$$"}
      </div>
      <p>
        where {"$n_{\\text{gt},\\,i}$"} is the number of ground-truth players visible in
        frame {"$i$"}. The {"$\\max(\\cdot,\\; 1)$"} ensures frames with no visible players
        don't divide by zero. The leaderboard headline is:
      </p>
      <div className="formula">
        {"$$\\text{Leaderboard score} \\;=\\; \\frac{1}{N} \\sum_{i=1}^{N} \\text{score}_i$$"}
      </div>
      <p>
        where {"$N = 385$"} (total frames in dataset). Units are meters; lower is better.
      </p>

      <h2 id="what-scored">What's scored (and what isn't)</h2>
      <p>
        Scoring is <strong>position-only</strong>. The model prompt asks for team and role
        labels, but these are ignored during evaluation — only the (x, y) coordinates
        matter. This isolates spatial reasoning from jersey/role classification.
      </p>

      <h2 id="evaluation">Evaluation procedure</h2>
      <p>
        For each frame in the dataset, the following process is applied identically
        to every model:
      </p>
      <ol>
        <li>The image and the text prompt below are sent to the model via{' '}
          <a href="https://docs.aws.amazon.com/bedrock/" target="_blank" rel="noopener noreferrer">AWS Bedrock</a>{' '}
          (temperature = 0 where supported).</li>
        <li>The model's response is parsed for a JSON array of player coordinates.</li>
        <li>If the API call fails or the response cannot be parsed as valid JSON,
          the frame is retried — up to 5 attempts total. API failures use exponential
          backoff between retries.</li>
        <li>Only the first successfully parsed response is used. If all 5 attempts
          fail, the frame is marked as failed and excluded from scoring.</li>
      </ol>
      <p>
        The same prompt is used for all models and all frames, with no few-shot
        examples or model-specific tuning:
      </p>
      <pre className="cite">{`You are analyzing a still frame from a broadcast television feed of a professional football (soccer) match. For every player visible in the image, estimate their position on the pitch in real-world meters.

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

- \`x\`: number, pitch x-coordinate in meters
- \`y\`: number, pitch y-coordinate in meters
- \`role\`: string, either "player" or "goalkeeper"
- \`team\`: string, either "left" (the team defending the x = -52.5 goal) or "right" (the team defending the x = +52.5 goal)

If no players are visible, return \`[]\`.`}</pre>

      <h2 id="cv-baseline">CV baseline</h2>
      <p>
        The reference baseline is{' '}
        <a href="https://github.com/SoccerNet/sn-gamestate" target="_blank" rel="noopener noreferrer">sn-gamestate</a>,
        the official baseline for the SoccerNet Game State Reconstruction challenge
        (Somers et al., CVPRW 2024). It is a classical computer-vision pipeline (not a VLM)
        that works in three stages:
      </p>
      <ol>
        <li><strong>Detection</strong> — a trained object detector identifies players
          and goalkeepers in each frame, producing bounding boxes.</li>
        <li><strong>Tracking</strong> — detections are linked across frames within a
          clip to form consistent tracks (multi-frame temporal context).</li>
        <li><strong>Homography</strong> — pitch lines are detected and used to compute
          a camera-to-pitch projection, mapping each player's image-space foot
          position to pitch-meter coordinates.</li>
      </ol>
      <p>
        Unlike the VLMs (which see a single frame in isolation), the baseline
        processes full video clips and benefits from multi-frame tracking and
        explicit geometric calibration. Its predictions are extracted for only
        the specific frames in our manifest, then scored identically to the VLMs.
      </p>
    </section>
  )
}
