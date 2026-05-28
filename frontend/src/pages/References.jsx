import React from 'react'

export default function References() {
  return (
    <section>
      <h1>References</h1>

      <h2>Dataset & CV baseline</h2>
      <ol className="references">
        <li>
          V. Somers, V. Joos, S. Giancola, A. Cioppa, S. A. Ghasemzadeh, F. Magera,
          B. Standaert, A. M. Mansourian, X. Zhou, S. Kasaei, B. Ghanem, A. Alahi,
          M. Van Droogenbroeck, and C. De Vleeschouwer,
          "SoccerNet Game State Reconstruction: End-to-End Athlete Tracking and
          Identification on a Minimap,"
          <em>Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern
          Recognition Workshops (CVPRW)</em>, 2024.{' '}
          <a href="https://arxiv.org/abs/2404.11335" target="_blank" rel="noopener noreferrer">arXiv:2404.11335</a>
          {' · '}<a href="https://github.com/SoccerNet/sn-gamestate" target="_blank" rel="noopener noreferrer">Code</a>
          {' · '}<a href="https://www.soccer-net.org/" target="_blank" rel="noopener noreferrer">Website</a>
          <br /><small>(Provides both the ground-truth dataset and the CV baseline pipeline used in this benchmark.)</small>
        </li>
      </ol>

      <h2>Metric</h2>
      <ol className="references" start={2}>
        <li>
          A. S. Rahmathullah, Á. F. García-Fernández, and L. Svensson,
          "Generalized Optimal Sub-Pattern Assignment Metric,"
          <em>Proceedings of the 20th International Conference on Information Fusion (FUSION)</em>, 2017.{' '}
          <a href="https://arxiv.org/abs/1601.05585" target="_blank" rel="noopener noreferrer">arXiv:1601.05585</a>
        </li>
        <li>
          H. W. Kuhn,
          "The Hungarian Method for the Assignment Problem,"
          <em>Naval Research Logistics Quarterly</em>, 2(1–2), pp. 83–97, 1955.{' '}
          <a href="https://en.wikipedia.org/wiki/Hungarian_algorithm" target="_blank" rel="noopener noreferrer">Wikipedia</a>
        </li>
      </ol>

      <h2>Models evaluated</h2>
      <ol className="references" start={4}>
        <li>
          Gemma Team,
          "Gemma 3 Technical Report," 2025.{' '}
          <a href="https://arxiv.org/abs/2503.19786" target="_blank" rel="noopener noreferrer">arXiv:2503.19786</a>
        </li>
        <li>
          P. Agrawal et al.,
          "Pixtral 12B," 2024.{' '}
          <a href="https://arxiv.org/abs/2410.07073" target="_blank" rel="noopener noreferrer">arXiv:2410.07073</a>
        </li>
        <li>
          Qwen Team,
          "Qwen2.5-VL Technical Report," 2025.{' '}
          <a href="https://arxiv.org/abs/2502.13923" target="_blank" rel="noopener noreferrer">arXiv:2502.13923</a>
        </li>
        <li>
          Moonshot AI,
          "Kimi K2.5: Visual Agentic Intelligence," 2025.{' '}
          <a href="https://arxiv.org/abs/2602.02276" target="_blank" rel="noopener noreferrer">arXiv:2602.02276</a>
        </li>
        <li>
          NVIDIA,
          "NVIDIA Nemotron Nano V2 VL," 2025.{' '}
          <a href="https://arxiv.org/abs/2511.03929" target="_blank" rel="noopener noreferrer">arXiv:2511.03929</a>
        </li>
        <li>
          Meta,
          "Llama 4 Model Card," 2025.{' '}
          <a href="https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md" target="_blank" rel="noopener noreferrer">GitHub</a>
        </li>
      </ol>

      <h2>Infrastructure</h2>
      <ol className="references" start={10}>
        <li>
          Amazon Web Services,
          "Amazon Bedrock — Fully managed foundation models."{' '}
          <a href="https://aws.amazon.com/bedrock/" target="_blank" rel="noopener noreferrer">aws.amazon.com/bedrock</a>
        </li>
      </ol>
    </section>
  )
}
