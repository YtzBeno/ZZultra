require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { ethers } = require("ethers");
const { Connection } = require("@solana/web3.js");

const app = express();
app.use(cors());
app.use(express.json());

// Postgres pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// EVM provider for Sepolia
const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

// Solana devnet connection
const solConnection = new Connection(process.env.SOLANA_DEVNET_URL);

app.get("/", (req, res) => {
  res.send("Hello from the Pool API!");
});

// Example verify function for EVM
async function verifyOnSepolia(txHash) {
  try {
    const receipt = await sepoliaProvider.getTransactionReceipt(txHash);
    // If receipt exists and status == 1 => success
    return receipt && receipt.status === 1;
  } catch (err) {
    console.error("Error verifying EVM tx:", err);
    return false;
  }
}

// Example verify for Solana
async function verifyOnSolana(sig) {
  try {
    const tx = await solConnection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
    });
    // If we got a valid transaction object, we can do further checks
    return !!tx; // if not null or undefined
  } catch (err) {
    console.error("Error verifying Solana tx:", err);
    return false;
  }
}

app.post("/api/transactions", async (req, res) => {
  try {
    const { chain, txHashOrSig, poolId, userAddress, amount, txType } =
      req.body;

    // quick checks
    if (!chain || !txHashOrSig || !poolId || !userAddress || !txType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify transaction on the correct chain
    let verified = false;
    if (chain === "Sepolia") {
      verified = await verifyOnSepolia(txHashOrSig);
    } else if (chain === "SolanaDevnet") {
      verified = await verifyOnSolana(txHashOrSig);
    }

    if (!verified) {
      return res
        .status(400)
        .json({ error: "Could not verify transaction on-chain" });
    }

    // Insert into transactions table
    const insertQuery = `
      INSERT INTO transactions (pool_id, transaction_type, amount, user_address, tx_hash_or_sig)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [
      poolId,
      txType,
      amount,
      userAddress,
      txHashOrSig,
    ]);

    res.json({ success: true, transaction: result.rows[0] });
  } catch (error) {
    console.error("Error in /api/transactions:", error);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Pool API listening on port ${PORT}`);
});

/**************************************
 * POOL ROUTES
 **************************************/

// POST /api/pools => create a new pool
app.post("/api/pools", async (req, res) => {
  try {
    const {
      pool_name,
      pool_image_gif,
      pool_description,
      chain,
      is_native_coin,
      token_address,
      operator_address,
      owner_address,
      rate_per_second,
      max_deposit_percentage,
      pool_fee_percentage,
      seconds_wait,
      pool_website,
      pool_telegram,
      pool_x,
      contract_address,
    } = req.body;

    // Minimal check
    if (!pool_name || !chain) {
      return res
        .status(400)
        .json({ error: "Missing required fields (pool_name, chain)." });
    }

    const insertPoolQuery = `
      INSERT INTO pools (
        pool_name,
        pool_image_gif,
        pool_description,
        chain,
        is_native_coin,
        token_address,
        operator_address,
        owner_address,
        rate_per_second,
        max_deposit_percentage,
        pool_fee_percentage,
        seconds_wait,
        pool_website,
        pool_telegram,
        pool_x,
        contract_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *;
    `;

    const result = await db.query(insertPoolQuery, [
      pool_name,
      pool_image_gif,
      pool_description,
      chain,
      is_native_coin,
      token_address,
      operator_address,
      owner_address,
      rate_per_second,
      max_deposit_percentage,
      pool_fee_percentage,
      seconds_wait,
      pool_website,
      pool_telegram,
      pool_x,
      contract_address,
    ]);

    return res.json({ success: true, pool: result.rows[0] });
  } catch (error) {
    console.error("Error in POST /api/pools:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/pools => list all pools
app.get("/api/pools", async (req, res) => {
  try {
    const allPools = await db.query("SELECT * FROM pools ORDER BY id DESC");
    res.json(allPools.rows);
  } catch (error) {
    console.error("Error in GET /api/pools:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/pools/:id => get pool by ID
app.get("/api/pools/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const poolResult = await db.query("SELECT * FROM pools WHERE id = $1", [
      id,
    ]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: "Pool not found" });
    }

    res.json(poolResult.rows[0]);
  } catch (error) {
    console.error("Error in GET /api/pools/:id:", error);
    res.status(500).json({ error: "Server error" });
  }
});
