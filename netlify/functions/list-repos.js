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

  // 🔒 Admin UID check
  const ADMIN_UID = "fxmTMyLt0WhJI2NOCmp6TVxPN2f2";

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { uid } = data;
  if (uid !== ADMIN_UID) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Admin access required" }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "GITHUB_TOKEN not configured" }) };
  }

  try {
    // Pagination — সব repo আনতে loop
    const repos = [];
    let page = 1;
    while (page <= 10) {  // সর্বোচ্চ ১০০০ repo
      const r = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "FF-ZONE",
          },
        }
      );
      if (!r.ok) break;
      const batch = await r.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      repos.push(...batch);
      if (batch.length < 100) break;  // শেষ page
      page++;
    }

    // শুধু দরকারি field map করি — response ছোট রাখতে
    const mapped = repos.map((r) => ({
      id: r.id,
      fullName: r.full_name,        // owner/repo
      name: r.name,
      owner: r.owner.login,
      private: r.private,
      defaultBranch: r.default_branch,  // main/master/other
      description: r.description || "",
      htmlUrl: r.html_url,
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, repos: mapped }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
