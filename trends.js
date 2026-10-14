async function trending(limit = 5) {
  try {
    const r = await fetch("https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1");
    const j = await r.json();
    return (j.data || []).slice(0, limit).map(p => {
      const a = p.attributes || {};
      const sym = (a.base_token_symbol || a.name || "?").slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
      return { symbol: sym || "MEME", name: a.name || sym };
    });
  } catch { return []; }
}
module.exports = { trending };
