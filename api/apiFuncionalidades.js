// apiNew.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
require('dotenv').config();

// ===== Logs iniciales =====
console.log("WM from env:", process.env.WATER_MANAGEMENT_CONTRACT_ADDRESS);
console.log("WT from env:", process.env.WATER_TOKEN_CONTRACT_ADDRESS);

// ===== Configuración desde .env =====
const RPC_URL = process.env.RPC_LOCAL || 'http://127.0.0.1:8545';

// Accounts (OWNER y COMPANY)
const OWNER_PUBLIC  = process.env.PUBLIC_KEY_OWNER;
const OWNER_PRIVATE = process.env.PRIVATE_KEY_OWNER;

const COMPANY_PUBLIC  = process.env.PUBLIC_KEY_COMPANY_A;
const COMPANY_PRIVATE = process.env.PRIVATE_KEY_COMPANY_A;

// Contrato WaterManagement
const WATER_MANAGEMENT_CONTRACT_ADDRESS =
  process.env.WATER_MANAGEMENT_CONTRACT_ADDRESS;

const WATER_MANAGEMENT_ABI_PATH =
  process.env.WATER_MANAGEMENT_ABI_PATH || '../build/contracts/WaterManagement.json';

// ===== Cargar ABI =====
let WATER_MANAGEMENT_ABI;
try {
  const raw = fs.readFileSync(
    path.resolve(__dirname, WATER_MANAGEMENT_ABI_PATH),
    'utf8'
  );
  const json = JSON.parse(raw);
  WATER_MANAGEMENT_ABI = json.abi || json; // sirve tanto si es artefacto completo como solo ABI
} catch (err) {
  console.error('❌ Error cargando ABI de WaterManagement:', err.message);
  process.exit(1);
}

// ===== Web3 apuntando a la red local =====
const web3 = createAlchemyWeb3(RPC_URL);

// Instancia de contrato reutilizable
const wmContract = new web3.eth.Contract(
  WATER_MANAGEMENT_ABI,
  WATER_MANAGEMENT_CONTRACT_ADDRESS
);

// ===== Cache en memoria de los datos simulados =====
// Aquí vamos a guardar lo que llega por /sensor
const sensorEvents = []; // { sensorId, siteId, value, timestamp, txHash? }

// ===== Express API =====
const app = express();
app.use(bodyParser.json());
app.use(cors());
const ROLES = {
  owner: {
    address: process.env.PUBLIC_KEY_OWNER,
    privateKey: process.env.PRIVATE_KEY_OWNER,
  },
  company: {
    address: process.env.PUBLIC_KEY_COMPANY_A,
    privateKey: process.env.PRIVATE_KEY_COMPANY_A,
  },
  government: {
    address: process.env.PUBLIC_KEY_GOVERNMENT,
    privateKey: process.env.PRIVATE_KEY_GOVERNMENT,
  },
};

function getRole(roleName) {
  const role = ROLES[roleName];
  if (!role || !role.address) {
    throw new Error(`Rol inválido o no configurado: ${roleName}`);
  }
  return role;
}

// ----------------------------------------------------
//  A) Endpoint para ver los datos simulados (/events)
// ----------------------------------------------------
app.get('/events', (req, res) => {
  // si quieres limitar a los últimos 100:
  const last = sensorEvents.slice(-100).reverse();
  return res.json({ count: last.length, events: last });
});

// GET /events/onchain?fromBlock=0&toBlock=latest
app.get('/events/onchain', async (req, res) => {
  try {
    const fromBlock = req.query.fromBlock
      ? Number(req.query.fromBlock)
      : 0;
    const toBlock = req.query.toBlock || 'latest';

    const logs = await wmContract.getPastEvents('pushData', {
      fromBlock,
      toBlock,
    });

    const events = logs.map((ev) => ({
      company: ev.returnValues.company,
      sensorId: ev.returnValues.sensorId,
      siteId: ev.returnValues.siteId,
      value: Number(ev.returnValues.value),
      timestamp: Number(ev.returnValues.timestamp),
      blockNumber: ev.blockNumber,
      txHash: ev.transactionHash,
    }));

    return res.json({
      count: events.length,
      events,
    });
  } catch (err) {
    console.error('❌ Error en /events/onchain:', err);
    return res.status(500).json({
      error: 'Failed to read on-chain events',
      details: err.message,
    });
  }
});


// GET /company/data?company=0x...
app.get('/company/data', async (req, res) => {
  try {
    const company = req.query.company || process.env.PUBLIC_KEY_COMPANY_A;

    const data = await wmContract.methods
      .pullDataByCompany()
      .call({ from: company }); // 👈 el "from" decide quién es msg.sender

    // data es un array de structs: { sensorId, siteId, value, timestamp }
    const mapped = data.map((d) => ({
      sensorId: d.sensorId,
      siteId: d.siteId,
      value: Number(d.value),
      timestamp: Number(d.timestamp),
    }));

    return res.json({ company, count: mapped.length, data: mapped });
  } catch (err) {
    console.error('❌ Error en /company/data:', err);
    return res.status(500).json({
      error: 'Failed to read company data',
      details: err.message,
    });
  }
});


// GET /government/data?gov=0x...&company=0x...
app.get('/government/data', async (req, res) => {
  try {
    const gov = req.query.gov || process.env.PUBLIC_KEY_GOVERNMENT;
    const company = req.query.company || process.env.PUBLIC_KEY_COMPANY_A;

    const data = await wmContract.methods
      .pullDataByGovernment(company)
      .call({ from: gov });

    const mapped = data.map((d) => ({
      sensorId: d.sensorId,
      siteId: d.siteId,
      value: Number(d.value),
      timestamp: Number(d.timestamp),
    }));

    return res.json({
      government: gov,
      company,
      count: mapped.length,
      data: mapped,
    });
  } catch (err) {
    console.error('❌ Error en /government/data:', err);
    return res.status(500).json({
      error: 'Failed to read government data',
      details: err.message,
    });
  }
});


// ----------------------------------------------------
//  B) Endpoint /sensor (simulado desde sensorA.js)
//      - Firma las tx con COMPANY
//      - Guarda en sensorEvents para el dashboard
// ----------------------------------------------------
app.post('/sensor22', async (req, res) => {
  try {
    if (!req.body || !req.body.data) {
      return res.status(400).json({ error: 'Payload inválido.' });
    }

    const { sensorId, siteId, value, timestamp } = req.body.data;
    console.log('Incoming data:', { sensorId, siteId, value, timestamp });

    if (
      sensorId === undefined ||
      siteId === undefined ||
      value === undefined ||
      timestamp === undefined
    ) {
      return res
        .status(400)
        .json({ error: 'Please provide sensorId, siteId, value, timestamp.' });
    }

    // Nonce de la cuenta emisora (company)
    const nonce = await web3.eth.getTransactionCount(COMPANY_PUBLIC, 'latest');

    // Estimar gas
    const gasEstimate = await wmContract.methods
      .pushData(sensorId, siteId, value, timestamp)
      .estimateGas({ from: COMPANY_PUBLIC });

    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: COMPANY_PUBLIC,
      to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
      nonce,
      gas: gasEstimate,
      gasPrice,
      data: wmContract.methods
        .pushData(sensorId, siteId, value, timestamp)
        .encodeABI(),
    };

    const signedTx = await web3.eth.accounts.signTransaction(
      tx,
      COMPANY_PRIVATE
    );

    web3.eth
      .sendSignedTransaction(signedTx.rawTransaction)
      .on('transactionHash', (hash) => {
        console.log('✅ TX enviada. Hash:', hash);

        // Guardamos registro en cache para el dashboard
        sensorEvents.push({
          sensorId,
          siteId,
          value,
          timestamp,
          txHash: hash,
        });
      })
      .on('receipt', (receipt) => {
        console.log('📦 TX minada en el bloque:', receipt.blockNumber);
      })
      .on('error', (err) => {
        console.error('❌ Error al enviar TX:', err);
      });

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Error en /sensor:', error);
    return res.status(500).json({
      error: 'Failed to send tx',
      details: error.message,
    });
  }
});

app.post('/sensor', async (req, res) => {
  try {
    if (!req.body || !req.body.data) {
      return res.status(400).json({ error: 'Payload inválido.' });
    }

    const { sensorId, siteId, value, timestamp } = req.body.data;
    const roleName = req.query.role || 'company'; // por defecto company

    const { address, privateKey } = getRole(roleName);

    console.log('Incoming data:', {
      role: roleName,
      from: address,
      sensorId,
      siteId,
      value,
      timestamp,
    });

    if (
      sensorId === undefined ||
      siteId === undefined ||
      value === undefined ||
      timestamp === undefined
    ) {
      return res
        .status(400)
        .json({ error: 'Please provide sensorId, siteId, value, timestamp.' });
    }

    const wmContract = new web3.eth.Contract(
      WATER_MANAGEMENT_ABI,
      WATER_MANAGEMENT_CONTRACT_ADDRESS
    );

    const nonce = await web3.eth.getTransactionCount(address, 'latest');

    const gasEstimate = await wmContract.methods
      .pushData(sensorId, siteId, value, timestamp)
      .estimateGas({ from: address });

    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: address,
      to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
      nonce,
      gas: gasEstimate,
      gasPrice,
      data: wmContract.methods
        .pushData(sensorId, siteId, value, timestamp)
        .encodeABI(),
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);

    web3.eth
      .sendSignedTransaction(signedTx.rawTransaction)
      .on('transactionHash', (hash) => {
        console.log('✅ TX enviada. Hash:', hash);
      })
      .on('receipt', (receipt) => {
        console.log('📦 TX minada en el bloque:', receipt.blockNumber);
      })
      .on('error', (err) => {
        console.error('❌ Error al enviar TX:', err);
      });

    return res.json({ success: true, from: address, role: roleName });
  } catch (error) {
    console.error('❌ Error en /sensor:', error);
    return res.status(500).json({
      error: 'Failed to send tx',
      details: error.message,
    });
  }
});


// ----------------------------------------------------
//  C) Panel OWNER: añadir companies/governments
//      POST /owner/entity
//      body: { address, name, id, entityType }
//      entityType: "company" | "government"
// ----------------------------------------------------
app.post('/owner/entity', async (req, res) => {
  try {
    const { address, name, id, entityType } = req.body || {};

    if (!address || !name || !id || !entityType) {
      return res.status(400).json({
        error: 'Faltan campos. Requiere address, name, id, entityType',
      });
    }

    console.log('OWNER → addEntity:', { address, name, id, entityType });

    const nonce = await web3.eth.getTransactionCount(OWNER_PUBLIC, 'latest');

    const gasEstimate = await wmContract.methods
      .addEntity(address, name, id, entityType)
      .estimateGas({ from: OWNER_PUBLIC });

    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: OWNER_PUBLIC,
      to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
      nonce,
      gas: gasEstimate,
      gasPrice,
      data: wmContract.methods
        .addEntity(address, name, id, entityType)
        .encodeABI(),
    };

    const signed = await web3.eth.accounts.signTransaction(tx, OWNER_PRIVATE);
    const receipt = await web3.eth.sendSignedTransaction(
      signed.rawTransaction
    );

    console.log('✅ Entity registrada. Tx:', receipt.transactionHash);

    return res.json({
      success: true,
      txHash: receipt.transactionHash,
      entity: { address, name, id, entityType },
    });
  } catch (error) {
    console.error('❌ Error en /owner/entity:', error);
    return res.status(500).json({
      error: 'Failed to send tx',
      details: error.message,
    });
  }
});

// ----------------------------------------------------
//  D) Panel COMPANY: registrar site
//      POST /company/site
//      body: { siteId, lat, lon, benchmark }
// ----------------------------------------------------
app.post('/company/site', async (req, res) => {
  try {
    const { siteId, lat, lon, benchmark } = req.body || {};

    if (!siteId || !lat || !lon || !benchmark) {
      return res.status(400).json({
        error: 'Faltan campos. Requiere siteId, lat, lon, benchmark',
      });
    }

    console.log('COMPANY → registerSite:', {
      siteId,
      lat,
      lon,
      benchmark,
    });

    const nonce = await web3.eth.getTransactionCount(
      COMPANY_PUBLIC,
      'latest'
    );

    const gasEstimate = await wmContract.methods
      .registerSite(siteId, String(lat), String(lon), benchmark)
      .estimateGas({ from: COMPANY_PUBLIC });

    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: COMPANY_PUBLIC,
      to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
      nonce,
      gas: gasEstimate,
      gasPrice,
      data: wmContract.methods
        .registerSite(siteId, String(lat), String(lon), benchmark)
        .encodeABI(),
    };

    const signed = await web3.eth.accounts.signTransaction(
      tx,
      COMPANY_PRIVATE
    );
    const receipt = await web3.eth.sendSignedTransaction(
      signed.rawTransaction
    );

    console.log('✅ Site registrado. Tx:', receipt.transactionHash);

    return res.json({
      success: true,
      txHash: receipt.transactionHash,
      site: { siteId, lat, lon, benchmark },
    });
  } catch (error) {
    console.error('❌ Error en /company/site:', error);
    return res.status(500).json({
      error: 'Failed to send tx',
      details: error.message,
    });
  }
});

// ----------------------------------------------------
//  E) Panel COMPANY: registrar sensor
//      POST /company/sensor
//      body: { sensorId }
// ----------------------------------------------------
app.post('/company/sensor', async (req, res) => {
  try {
    const { sensorId } = req.body || {};

    if (!sensorId) {
      return res.status(400).json({
        error: 'Falta sensorId',
      });
    }

    console.log('COMPANY → registerSensor:', { sensorId });

    const nonce = await web3.eth.getTransactionCount(
      COMPANY_PUBLIC,
      'latest'
    );

    const gasEstimate = await wmContract.methods
      .registerSensor(sensorId)
      .estimateGas({ from: COMPANY_PUBLIC });

    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: COMPANY_PUBLIC,
      to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
      nonce,
      gas: gasEstimate,
      gasPrice,
      data: wmContract.methods.registerSensor(sensorId).encodeABI(),
    };

    const signed = await web3.eth.accounts.signTransaction(
      tx,
      COMPANY_PRIVATE
    );
    const receipt = await web3.eth.sendSignedTransaction(
      signed.rawTransaction
    );

    console.log('✅ Sensor registrado. Tx:', receipt.transactionHash);

    return res.json({
      success: true,
      txHash: receipt.transactionHash,
      sensorId,
    });
  } catch (error) {
    console.error('❌ Error en /company/sensor:', error);
    return res.status(500).json({
      error: 'Failed to send tx',
      details: error.message,
    });
  }
});

// ===== Arrancar servidor =====
app.listen(5000, () => {
  console.log('API listening on port 5000 (RPC local)...');
});
