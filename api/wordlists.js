const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "Gregoirefauvarque";
const GITHUB_REPO  = process.env.GITHUB_REPO  || "dictee-app";
const GITHUB_FILE  = "woordenlijsten.json";

const GH_HEADERS = {
  "Authorization": `Bearer ${GITHUB_TOKEN}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};
const GH_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

async function ghGetFile() {
  const res = await fetch(GH_API, { headers: GH_HEADERS });
  if (res.status === 404) return { content: [], sha: null };
  if (!res.ok) throw new Error(`GitHub fout: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8"));
  return { content, sha: data.sha };
}

async function ghSaveFile(content, sha) {
  const body = {
    message: sha ? "Woordenlijst bijgewerkt" : "Woordenlijsten aangemaakt",
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
  };
  if (sha) body.sha = sha;
  const res = await fetch(GH_API, { method: "PUT", headers: GH_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub fout: ${res.status}`);
  }
}

export default async function handler(req, res) {
  if (!GITHUB_TOKEN) return res.status(500).json({ error: "GITHUB_TOKEN niet geconfigureerd" });

  try {
    if (req.method === "GET") {
      const { content } = await ghGetFile();
      return res.status(200).json(content);
    }

    if (req.method === "POST") {
      const { title, words } = req.body;
      if (!title || !words?.length) return res.status(400).json({ error: "title en words zijn verplicht" });
      const { content, sha } = await ghGetFile();
      const existing = content.findIndex((l) => l.title === title);
      const entry = {
        id: existing >= 0 ? content[existing].id : Date.now().toString(),
        title,
        words,
        created_at: existing >= 0 ? content[existing].created_at : new Date().toISOString(),
      };
      if (existing >= 0) content[existing] = entry;
      else content.unshift(entry);
      await ghSaveFile(content, sha);
      return res.status(200).json(entry);
    }

    if (req.method === "DELETE") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id is verplicht" });
      const { content, sha } = await ghGetFile();
      await ghSaveFile(content.filter((l) => l.id !== id), sha);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
