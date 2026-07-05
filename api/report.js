// Vercel serverless function: receive a community phishing report from Vev and
// commit it to the feed repo's reports/ directory via the GitHub API. A GitHub
// Action in that repo then aggregates reports into flagged.json.
//
// Vev submits only { host, ai_score, vote } — a plaintext hostname and the
// on-device model's score, never a full URL or browsing history. Reporting is
// opt-in and manual in the browser.
//
// Env: GITHUB_TOKEN (contents:write on FEED_REPO), FEED_REPO (owner/name).

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export default async function handler(req, res) {
  // CORS: the browser posts from its own origin; allow any and only POST.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "bad json" }); }
  }
  const host = String(body?.host || "").trim().toLowerCase();
  const aiScore = Number(body?.ai_score);
  const vote = body?.vote === "deny" ? "deny" : "confirm";

  if (!HOST_RE.test(host) || host.length > 253) {
    return res.status(400).json({ error: "invalid host" });
  }
  const score = Number.isFinite(aiScore) ? Math.max(0, Math.min(1, aiScore)) : 0;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.FEED_REPO || "aryansrao/community-phishing-feed";
  if (!token) {
    // No token configured yet — accept the report without persisting so the
    // browser flow still works during setup.
    return res.status(202).json({ ok: true, persisted: false });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeHost = host.replace(/[^a-z0-9.-]/g, "_");
  const path = `reports/${ts}_${safeHost}.json`;
  const content = Buffer.from(
    JSON.stringify({ host, ai_score: score, vote, at: new Date().toISOString() }, null, 2) + "\n"
  ).toString("base64");

  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "vev-report-api",
      },
      body: JSON.stringify({ message: `report: ${host} (${vote})`, content }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "github", detail: detail.slice(0, 200) });
    }
    return res.status(201).json({ ok: true, persisted: true });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 200) });
  }
}
