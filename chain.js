require("dotenv").config();
const fs = require("fs");
const bs58 = require("bs58");
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } = require("@solana/web3.js");
const { PumpFunSDK, DEFAULT_DECIMALS } = require("pumpdotfun-sdk");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet").default;
const { AnchorProvider } = require("@coral-xyz/anchor");

const RPC = process.env.RPC_URL;
const FEE = { unitLimit: 250000, unitPrice: 250000 };
const SLIP = 500n;
const kp = () => Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const provider = () => new AnchorProvider(new Connection(RPC, { commitment: "finalized" }),
  new NodeWallet(kp()), { commitment: "finalized" });
const sdk = () => new PumpFunSDK(provider());

async function walletBalanceSol() {
  return (await new Connection(RPC).getBalance(kp().publicKey)) / LAMPORTS_PER_SOL;
}
async function makeImage(ticker) {
  const url = `https://placehold.co/512x512/111/fff/png?text=${encodeURIComponent(ticker)}`;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.mkdirSync("./img", { recursive: true });
  const p = `./img/${ticker}.png`; fs.writeFileSync(p, buf); return p;
}
async function createCoin({ name, symbol, description, imagePath, devBuySol }) {
  const mint = Keypair.generate();
  const res = await sdk().createAndBuy(kp(), mint, { name, symbol, description, filePath: imagePath },
    BigInt(Math.floor(devBuySol * LAMPORTS_PER_SOL)), SLIP, FEE);
  return { ok: res.success, mint: mint.publicKey.toBase58() };
}
async function tokenBalance(mint) {
  const c = new Connection(RPC);
  const res = await c.getTokenAccountsByOwner(kp().publicKey, { mint: new PublicKey(mint) });
  if (!res.value.length) return 0;
  return (await c.getTokenAccountBalance(res.value[0].pubkey)).value.uiAmount || 0;
}
async function priceUsd(mint) {
  try {
    const j = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)).json();
    return j.pairs && j.pairs[0] ? parseFloat(j.pairs[0].priceUsd) : null;
  } catch { return null; }
}
async function sellAll(mint) {
  const amt = await tokenBalance(mint); if (!amt) return { ok: false };
  const res = await sdk().sell(kp(), new PublicKey(mint),
    BigInt(Math.floor(amt * 10 ** DEFAULT_DECIMALS)), SLIP, FEE);
  return { ok: res.success };
}
module.exports = { walletBalanceSol, makeImage, createCoin, tokenBalance, priceUsd, sellAll };
