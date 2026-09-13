exports.handler = async (event, context) => {
  // CORS headers — browser থেকে call করার অনুমতি
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // OPTIONS request = browser-এর preflight check
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // শুধু POST accept করি
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // 🔒 শুধু এই UID admin
  const ADMIN_UID = "2xZl7s9tDzdVdtlJz3I3kWT37vG2";

  // Request body parse
  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { uid } = data;
  if (uid !== ADMIN_UID) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Admin access required" }) };
  }

  // Vercel/Netlify env var থেকে token পড়ি
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "GITHUB_TOKEN not configured" }) };
  }

  try {
    // GitHub API — /user endpoint → কে এই token holder?
    const r = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "FF-ZONE",
      },
    });

    if (!r.ok) {
      return { statusCode: r.status, headers, body: JSON.stringify({ error: "GitHub token invalid or expired" }) };
    }

    const user = await r.json();

    // কতগুলো repo accessible — count করি
    const repoRes = await fetch(
      "https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "FF-ZONE",
        },
      }
    );
    const repos = repoRes.ok ? await repoRes.json() : [];

    // Safe তথ্য ফেরত পাঠাই — TOKEN কখনো নয়
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        username: user.login,
        avatarUrl: user.avatar_url,
        repoCount: Array.isArray(repos) ? repos.length : 0,
      }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
