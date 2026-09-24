const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, token, attempt = 1) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "profile-readme-builder",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (attempt < 4) {
      await sleep(2 ** attempt * 1000);
      return request(url, token, attempt + 1);
    }
    throw new Error(`network error calling ${url}: ${err.message}`);
  }

  const rateLimited = res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
  if ((res.status >= 500 || rateLimited) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    let wait = 2 ** attempt * 1000;
    if (retryAfter) wait = retryAfter * 1000;
    else if (rateLimited && reset) wait = reset * 1000 - Date.now() + 1000;
    if (wait > 60_000) throw new Error(`rate limited by the GitHub API until ${new Date(reset * 1000).toISOString()}`);
    await sleep(Math.max(wait, 1000));
    return request(url, token, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function fetchRepos(username, token) {
  const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  let url = `${api}/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&per_page=100`;
  const repos = [];
  for (let page = 0; url && page < 30; page++) {
    const res = await request(url, token);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("unexpected API response: expected an array of repositories");
    repos.push(...data);
    const next = (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return repos;
}
