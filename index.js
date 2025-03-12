require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { ethers } = require("ethers");
const { Connection } = require("@solana/web3.js");
const uploadRoutes = require("./uploadRoutes");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", uploadRoutes);

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

// -----------------------------------------------------------------------
// Helper: Verify EVM tx on Sepolia
// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
// Helper: Verify Solana tx
// -----------------------------------------------------------------------
async function verifyOnSolana(sig) {
  try {
    const tx = await solConnection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
    });
    return !!tx; // if not null => we consider it verified
  } catch (err) {
    console.error("Error verifying Solana tx:", err);
    return false;
  }
}

// -----------------------------------------------------------------------
// POST /api/transactions => insert a new transaction
// -----------------------------------------------------------------------
app.post("/api/transactions", async (req, res) => {
  try {
    const { chain, txHashOrSig, poolId, userAddress, amount, txType } =
      req.body;

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

// -----------------------------------------------------------------------
// [NEW] GET /api/pools/:poolId/transactions => list transactions for that pool
// -----------------------------------------------------------------------
app.get("/api/pools/:poolId/transactions", async (req, res) => {
  try {
    const { poolId } = req.params;

    // Query the transactions table for this pool, order by newest first
    // Make sure your 'transactions' table has a 'created_on' or similar timestamp
    const sql = `
      SELECT 
        id,
        pool_id,
        transaction_type,
        amount,
        user_address,
        tx_hash_or_sig,
        created_on
      FROM transactions
      WHERE pool_id = $1
      ORDER BY created_on DESC
      LIMIT 50;
    `;
    const result = await db.query(sql, [poolId]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error listing transactions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -----------------------------------------------------------------------
// Start the server
// -----------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Pool API listening on port ${PORT}`);
});

// -----------------------------------------------------------------------
// POOL ROUTES
// -----------------------------------------------------------------------
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
      pool_token_account,
    } = req.body;

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
        contract_address,
        pool_token_account
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
      pool_token_account || null,
    ]);

    return res.json({ success: true, pool: result.rows[0] });
  } catch (error) {
    console.error("Error in POST /api/pools:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/pools", async (req, res) => {
  try {
    const allPools = await db.query("SELECT * FROM pools ORDER BY id DESC");
    res.json(allPools.rows);
  } catch (error) {
    console.error("Error in GET /api/pools:", error);
    res.status(500).json({ error: "Server error" });
  }
});

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
