exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // 🔒 Admin UID
  const ADMIN_UID = "fxmTMyLt0WhJI2NOCmp6TVxPN2f2";

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const {
    uid, name, thumbnail, categoryId, categoryName,
    status, description, repository, htmlContent,
  } = data;

  if (uid !== ADMIN_UID) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Admin access required" }) };
  }
  if (!name || !categoryId || !status || !repository) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "GITHUB_TOKEN not configured" }) };
  }

  // "owner/repo" ভেঙে ফেলি
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid repository format" }) };
  }

  // GitHub API headers — প্রতিটা call-এ লাগবে
  const GH = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "FF-ZONE",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    // ✅ Step 1: Repository আছে কিনা + access আছে কিনা verify
    const repoCheck = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: GH });
    if (!repoCheck.ok) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Repository not accessible" }) };
    }
    const repoData = await repoCheck.json();
    const defaultBranch = repoData.default_branch || "main";  // main/master/other

    let commitSha = null;
    let pagesStatus = "not_enabled";
    let liveUrl = null;

    // ✅ Step 2: LIVE app হলে HTML file upload করি
    if (status === "live" && htmlContent) {
      // আগের index.html আছে কিনা দেখি — SHA লাগবে update করতে
      let existingSha = null;
      const getRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/index.html`,
        { headers: GH }
      );
      if (getRes.ok) {
        const getData = await getRes.json();
        existingSha = getData.sha;
      }

      // Commit message
      const commitMessage = existingSha
        ? `Update app from FF ZONE — ${name}`
        : `Publish app from FF ZONE — ${name}`;

      // Request body
      const body = {
        message: commitMessage,
        content: Buffer.from(htmlContent, "utf8").toString("base64"),  // base64 encode
        branch: defaultBranch,
      };
      if (existingSha) body.sha = existingSha;  // update-এর জন্য SHA লাগে

      // GitHub-এ PUT — file create/update
      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/index.html`,
        {
          method: "PUT",
          headers: { ...GH, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!putRes.ok) {
        const errText = await putRes.text();
        return { statusCode: 500, headers, body: JSON.stringify({ error: "GitHub upload failed: " + errText }) };
      }

      const putData = await putRes.json();
      commitSha = putData.commit?.sha;  // commit ID
    }

    // ✅ Step 3: GitHub Pages status check
    const pagesRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pages`,
      { headers: GH }
    );

    if (pagesRes.ok) {
      // Pages enabled
      const pagesData = await pagesRes.json();
      pagesStatus = pagesData.status || "pending";  // built/building/errored
      liveUrl = pagesData.html_url || `https://${owner.toLowerCase()}.github.io/${repo}/`;
    } else if (status === "live") {
      // Pages not enabled — কিন্তু URL predict করি
      pagesStatus = "not_enabled";
      liveUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
    }

    // ✅ সব ঠিক থাকলে success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, commitSha, liveUrl, pagesStatus, defaultBranch }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error: " + e.message }) };
  }
};
