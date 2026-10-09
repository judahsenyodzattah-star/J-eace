import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, Code2, Copy, ExternalLink, FileCode2, Globe2, KeyRound, LockKeyhole, Play, ShieldCheck, Terminal } from 'lucide-react';

const snippets = {
  curl: `curl -X POST http://localhost:3001/v1/analyze \\\n  -H "Authorization: Bearer $JEACE_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{
    "text": "Content submitted for analysis.",
    "source": "assignment",
    "content_type": "text/plain",
    "locale": "en"
  }'`,
  javascript: `const response = await fetch("https://api.example.com/v1/analyze", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.JEACE_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "Content submitted for analysis.",
    source: "assignment",
    locale: "en",
  }),
});
const result = await response.json();`,
  python: `import os
import requests

result = requests.post(
    "https://api.example.com/v1/analyze",
    headers={"Authorization": f"Bearer {os.environ['JEACE_API_KEY']}"},
    json={"text": "Content submitted for analysis.", "source": "assignment", "locale": "en"},
    timeout=10,
).json()`,
};

type SnippetKey = keyof typeof snippets;

export function DocsPage() {
  const [language, setLanguage] = useState<SnippetKey>('curl');
  const [copied, setCopied] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  async function copy(value: string, endpoint = false) {
    try { await navigator.clipboard.writeText(value); if (endpoint) { setCopiedEndpoint(true); setTimeout(() => setCopiedEndpoint(false), 1500); } else { setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch { /* Clipboard permission may be unavailable in embedded previews. */ }
  }
  return <div className="page-content docs-page">
    <div className="page-heading"><div><div className="eyebrow">BUILD WITH J’EACE <span className="eyebrow-separator">/</span> DEVELOPER RESOURCES</div><h1>Developer docs</h1><p>Connect an application to J’eace in a few steps. Start in the sandbox, then add your own trained detector.</p></div><div className="heading-actions"><span className="docs-version-tag"><span className="health-dot" />API v1 · Sandbox</span></div></div>
    <div className="docs-layout"><nav className="docs-toc"><span>GETTING STARTED</span><a className="toc-active" href="#quickstart">Quickstart</a><a href="#authentication">Authentication</a><a href="#analyze-endpoint">Analyze text</a><a href="#response">Response &amp; decisions</a><span className="toc-divider" /><span>REFERENCE</span><a href="#errors">Errors &amp; retries</a><a href="#ml-service">ML service</a><a href="#limitations">Limitations</a><div className="docs-help-card"><span><Globe2 size={16} /></span><b>Building a detector?</b><p>See the fine-tuning pipeline and evaluation guide in the project README.</p><a href="#ml-service">Open ML guide <ArrowRight size={13} /></a></div></nav>
      <main className="docs-main"><section className="docs-section" id="quickstart"><div className="docs-section-number">01</div><div><h2>Quickstart</h2><p>Send text to the analysis endpoint and receive a score plus a policy-driven moderation outcome. This sandbox uses a clearly labeled heuristic; connect the included ML inference service for a fine-tuned model.</p><div className="docs-callout docs-callout-warning"><span className="docs-callout-icon"><ShieldCheck size={16} /></span><span><b>Sandbox only.</b> The demo scorer is not a trained model and should never drive high-impact decisions.</span></div></div></section>
        <section className="docs-section" id="authentication"><div className="docs-section-number">02</div><div><h2>Authentication</h2><p>Use an application-scoped API key in the Authorization header. Store keys in a server-side secret manager—never expose them in browser code.</p><div className="endpoint-line"><div><KeyRound size={14} /><span>Authentication</span></div><code>Authorization: Bearer JEACE_API_KEY</code><button onClick={() => copy('Authorization: Bearer JEACE_API_KEY', true)} aria-label="Copy authorization header">{copiedEndpoint ? <Check size={14} /> : <Copy size={14} />}</button></div><div className="docs-callout"><LockKeyhole size={15} /><span>Keys should be hashed at rest, revocable, expiring, and scoped to a single application. The local demo key is not production-grade.</span></div></div></section>
        <section className="docs-section" id="analyze-endpoint"><div className="docs-section-number">03</div><div><h2>Analyze text</h2><p>Submit one text sample to receive an AI-likelihood score and the policy decision for the authenticated application.</p><div className="endpoint-line"><div><span className="http-method">POST</span><span>Analyze content</span></div><code>/v1/analyze</code><button onClick={() => copy('/v1/analyze', true)} aria-label="Copy endpoint">{copiedEndpoint ? <Check size={14} /> : <Copy size={14} />}</button></div><div className="code-card"><div className="code-card-header"><div><Terminal size={14} /><span>Request example</span></div><div className="code-tabs">{(['curl', 'javascript', 'python'] as SnippetKey[]).map((tab) => <button key={tab} className={language === tab ? 'active' : ''} onClick={() => setLanguage(tab)}>{tab === 'javascript' ? 'Node.js' : tab === 'python' ? 'Python' : 'cURL'}</button>)}</div><button className="code-copy" onClick={() => copy(snippets[language])}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div><pre><code>{snippets[language]}</code></pre></div><div className="request-fields"><div><code>text</code><span>string · required</span><p>Plain text to evaluate. Maximum 20,000 characters.</p></div><div><code>source</code><span>string · optional</span><p>Application-defined context such as assignment or discussion.</p></div><div><code>locale</code><span>string · optional</span><p>BCP-47 locale tag. Model support is language-dependent.</p></div><div><code>context</code><span>object · optional</span><p>Non-sensitive metadata. Do not include secrets or unnecessary PII.</p></div></div></div></section>
        <section className="docs-section" id="response"><div className="docs-section-number">04</div><div><h2>Response &amp; decisions</h2><p>Scores are floats in the range 0.0–1.0. Detection and moderation are separate: the score is classified with the app’s versioned thresholds.</p><div className="code-response"><div className="response-code-label"><FileCode2 size={14} />200 · application/json</div><pre><code>{`{
  "id": "an_7a81e3f2",
  "score": 0.71,
  "confidence": 0.84,
  "classification": "AI_LIKELY",
  "model": "j-eace-demo-heuristic",
  "model_version": "demo.1",
  "latency_ms": 76,
  "decision": "FLAG",
  "policy_version": 3
}`}</code></pre></div><div className="decision-reference"><div><span className="decision-ref-dot ref-allow" /><b>ALLOW</b><span>Below the flag threshold</span></div><div><span className="decision-ref-dot ref-flag" /><b>FLAG</b><span>Human review band</span></div><div><span className="decision-ref-dot ref-block" /><b>BLOCK</b><span>At or above block threshold</span></div></div></div></section>
        <section className="docs-section" id="errors"><div className="docs-section-number">05</div><div><h2>Errors &amp; retries</h2><p>Errors use a stable envelope. Retry transient 5xx responses with bounded exponential backoff; do not retry validation or authentication errors.</p><div className="error-reference"><div><span className="error-code">400</span><b>INVALID_REQUEST</b><span>Fix the request body.</span></div><div><span className="error-code">401</span><b>UNAUTHORIZED</b><span>Check or rotate the API key.</span></div><div><span className="error-code">429</span><b>RATE_LIMITED</b><span>Respect Retry-After.</span></div><div><span className="error-code">503</span><b>DETECTOR_UNAVAILABLE</b><span>Try again once after a delay.</span></div></div></div></section>
        <section className="docs-section" id="ml-service"><div className="docs-section-number">06</div><div><h2>Connect a trained detector</h2><p>The Python ML service implements the internal <code>/internal/predict</code> contract. Fine-tune the included DistilBERT pipeline on a documented, license-compatible dataset and configure <code>ML_SERVICE_URL</code> on the core API.</p><div className="ml-service-callout"><span className="ml-service-icon"><Code2 size={16} /></span><div><b>Internal inference interface</b><code>POST /internal/predict · {`{ text, locale? }`} → {`{ score, confidence, model_version }`}</code></div><span className="not-connected-tag"><i />NOT CONNECTED</span></div><div className="docs-callout docs-callout-warning"><ShieldCheck size={15} /><span>Evaluation must report F1, precision, recall, ROC-AUC, false-positive and false-negative rates, latency, and limitations. Do not claim perfect authorship detection.</span></div></div></section>
        <section className="docs-section" id="limitations"><div className="docs-section-number">07</div><div><h2>Limitations &amp; responsible use</h2><p>AI-generated-text detection is imperfect and can be biased by writing style, language, text length, domain, paraphrasing, editing, model drift, and unseen generators. A score represents a model estimate—not proof.</p><div className="docs-limits-list"><span><Check size={13} />Use multiple sources of evidence</span><span><Check size={13} />Provide an appeal and human review path</span><span><Check size={13} />Audit false positives and false negatives</span><span><Check size={13} />Keep sensitive content out of logs</span></div></div></section>
        <div className="docs-footer"><div className="docs-footer-icon"><ShieldCheck size={17} /></div><div><b>Built for transparent evaluation.</b><span>J’eace · Evaluation, Authenticity, Classification &amp; Enforcement</span></div><a href="#quickstart">Back to top <ArrowRight size={13} /></a></div>
      </main></div>
  </div>;
}
