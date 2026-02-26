const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const FILE_PATH = "woordenlijsten.json";

const HEADERS = {
  "Authorization": `Bearer ${GITHUB_TOKEN}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

// Haal het bestand op van GitHub (geeft inhoud + sha terug)
async function getFile() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
    { headers: HEADERS }
  );
  if (res.status === 404) return { content: [], sha: null };
  if (!res.ok) throw new Error(`GitHub fout: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
  return { content, sha: data.sha };
}

// Sla het bestand op naar GitHub
async function saveFile(content, sha) {
  const body = {
    message: sha ? "Woordenlijst bijgewerkt" : "Woordenlijsten aangemaakt",
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
    { method: "PUT", headers: HEADERS, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub fout: ${res.status}`);
  }
}

export default async function handler(req, res) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(500).json({ error: "GitHub niet geconfigureerd" });
  }

  try {
    // GET — haal alle woordenlijsten op
    if (req.method === "GET") {
      const { content } = await getFile();
      return res.status(200).json(content);
    }

    // POST — voeg toe of update bestaande reeks
    if (req.method === "POST") {
      const { title, words } = req.body;
      if (!title || !words?.length) {
        return res.status(400).json({ error: "title en words zijn verplicht" });
      }
      const { content, sha } = await getFile();
      const existing = content.findIndex((l) => l.title === title);
      const entry = {
        id: existing >= 0 ? content[existing].id : Date.now().toString(),
        title,
        words,
        created_at: existing >= 0 ? content[existing].created_at : new Date().toISOString(),
      };
      if (existing >= 0) content[existing] = entry;
      else content.unshift(entry);
      await saveFile(content, sha);
      return res.status(200).json(entry);
    }

    // DELETE — verwijder op id
    if (req.method === "DELETE") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id is verplicht" });
      const { content, sha } = await getFile();
      const filtered = content.filter((l) => l.id !== id);
      await saveFile(filtered, sha);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
