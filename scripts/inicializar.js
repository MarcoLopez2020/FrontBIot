const fs = require('fs');
const path = require('path');
const { createAlchemyWeb3 } = require('@alch/alchemy-web3');
require('dotenv').config();

// RPC local
const RPC_URL = process.env.RPC_LOCAL || 'http://127.0.0.1:8545';
const web3 = createAlchemyWeb3(RPC_URL);

// Direcciones y contrato
const WATER_MANAGEMENT_CONTRACT_ADDRESS =
  process.env.WATER_MANAGEMENT_CONTRACT_ADDRESS;

const WATER_MANAGEMENT_ABI_PATH =
  process.env.WATER_MANAGEMENT_ABI_PATH || '../build/contracts/WaterManagement.json';

// Cargar ABI
const raw = fs.readFileSync(
  path.resolve(__dirname, WATER_MANAGEMENT_ABI_PATH),
  'utf8'
);
const json = JSON.parse(raw);
const ABI = json.abi || json;

const contract = new web3.eth.Contract(
  ABI,
  WATER_MANAGEMENT_CONTRACT_ADDRESS
);

// Cuentas
const OWNER = process.env.PUBLIC_KEY_OWNER;
const OWNER_PK = process.env.PRIVATE_KEY_OWNER;

const COMPANY_A = process.env.PUBLIC_KEY_COMPANY_A;
const COMPANY_A_PK = process.env.PRIVATE_KEY_COMPANY_A;
// ======== Enviar fondos de OWNER → COMPANY_A ========
async function fundCompanyA() {
  console.log('💸 Enviando fondos de OWNER a COMPANY_A...');

  const tx = {
    from: OWNER,
    to: COMPANY_A,
    value: web3.utils.toWei('100', 'ether'), // igual que "100 ether"
    gas: 21000, // gas fijo para una transferencia simple
    gasPrice: await web3.eth.getGasPrice(),
    nonce: await web3.eth.getTransactionCount(OWNER, 'latest'),
  };

  const signedTx = await web3.eth.accounts.signTransaction(tx, OWNER_PK);
  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

  console.log('✅ Fondos enviados. Tx:', receipt.transactionHash);

  // Consultar balances
  const balanceOwner = await web3.eth.getBalance(OWNER);
  const balanceCompany = await web3.eth.getBalance(COMPANY_A);
  console.log('Saldo OWNER:', web3.utils.fromWei(balanceOwner, 'ether'), 'ETH');
  console.log('Saldo COMPANY_A:', web3.utils.fromWei(balanceCompany, 'ether'), 'ETH');
}

async function main() {
  console.log('⏳ Inicializando estado en la red local...\n');
  await fundCompanyA();
  // ========= 1) Registrar Company A como entidad (lo hace el OWNER) =========
  const ownerNonce = await web3.eth.getTransactionCount(OWNER, 'latest');

  const txAddEntity = {
    from: OWNER,
    to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
    nonce: ownerNonce,
    gas: 500000,
    data: contract.methods
      .addEntity(COMPANY_A, 'Empresa A', 'NIF-EMP-A', 'company')
      .encodeABI(),
  };

  const signedAddEntity = await web3.eth.accounts.signTransaction(
    txAddEntity,
    OWNER_PK
  );
  const receiptAddEntity = await web3.eth.sendSignedTransaction(
    signedAddEntity.rawTransaction
  );
  console.log('✅ Entity Empresa A registrada');
  console.log('   Tx:', receiptAddEntity.transactionHash);

  // ========= 2) Registrar siteA (lo hace Company A) =========
  // Requisitos del contrato:
  // function registerSite(string _siteId, string _latitude, string _longitude, uint _benchmark)
  //
  // OJO: benchmark > 0 para que no falle fetchBenchmark
  const companyNonce1 = await web3.eth.getTransactionCount(
    COMPANY_A,
    'latest'
  );

  const txRegisterSite = {
    from: COMPANY_A,
    to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
    nonce: companyNonce1,
    gas: 500000,
    data: contract.methods
      .registerSite('siteA', '-1.2345', '-78.1234', 800) // ajusta benchmark según tu lógica
      .encodeABI(),
  };

  const signedRegisterSite = await web3.eth.accounts.signTransaction(
    txRegisterSite,
    COMPANY_A_PK
  );
  const receiptRegisterSite = await web3.eth.sendSignedTransaction(
    signedRegisterSite.rawTransaction
  );
  console.log('✅ Site siteA registrado para Company A');
  console.log('   Tx:', receiptRegisterSite.transactionHash);

  // ========= 3) Registrar sensorA (lo hace Company A) =========
  // function registerSensor(string _sensorId) external onlyCompany(msg.sender)
  const companyNonce2 = companyNonce1 + 1;

  const txRegisterSensor = {
    from: COMPANY_A,
    to: WATER_MANAGEMENT_CONTRACT_ADDRESS,
    nonce: companyNonce2,
    gas: 500000,
    data: contract.methods.registerSensor('sensorA').encodeABI(),
  };

  const signedRegisterSensor = await web3.eth.accounts.signTransaction(
    txRegisterSensor,
    COMPANY_A_PK
  );
  const receiptRegisterSensor = await web3.eth.sendSignedTransaction(
    signedRegisterSensor.rawTransaction
  );
  console.log('✅ Sensor sensorA registrado para Company A');
  console.log('   Tx:', receiptRegisterSensor.transactionHash);

  console.log('\n🎯 Inicialización completada. Ya puedes mandar datos desde sensorA.');
}

main().catch((err) => {
  console.error('❌ Error en inicializar:', err);
});
