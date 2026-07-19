import fs from 'node:fs';
import { createWallet, waitForWalletSync, createProviders, ProofFolio, toBytes32FromHex } from './scripts/midnight-utils.mjs';

function parseEnv(path) {
  const env = {};
  for (const raw of fs.readFileSync(path,'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > -1) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
  }
  return env;
}

async function run() {
  const env = parseEnv('./frontend/.env.local');
  const addr = env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const operatorSeed = '8dab386a361d309f923ad9b151fc4409946c6549b1d6dc04f3a929e96db4cd48';
  
  const w = await createWallet(operatorSeed);
  await waitForWalletSync(w, 20000).catch(()=>{});
  const p = await createProviders(w, 'ProofFolio-api-private-state-preprod');
  const s = await p.publicDataProvider.queryContractState(addr);
  if (!s) { console.log('State is null'); process.exit(1); }
  
  const l = ProofFolio.ledger(s.data);
  const secret = '0000000000000000000000000000000000000000000000000000000000000001';
  const c = new ProofFolio.Contract({
    adminSecretKey: ()=>[null, new Uint8Array(32)],
    issuerSecretKey: ()=>[null, new Uint8Array(32)],
    studentSecretKey: ()=>[null, new Uint8Array(32)],
    credentialPayload: ()=>[null, new Uint8Array(32)],
    credentialNonce: ()=>[null, new Uint8Array(32)],
    credentialIssuerPk: ()=>[null, new Uint8Array(32)],
    findCredentialPath: ()=>[null, {leaf: new Uint8Array(32), path: []}],
  });
  
  const issuerPk = c._issuerPublicKey_0(toBytes32FromHex(secret));
  console.log("Issuer pk hex:", Buffer.from(issuerPk).toString('hex'));
  
  // Actually iterate and check membership.
  try {
    let found = false;
    console.log("Auth issuers set size:", Array.from(l.authorizedIssuers).length);
    for (const authPk of l.authorizedIssuers) {
      console.log('-- auth item:', Buffer.from(authPk).toString('hex'));
      if (Buffer.from(authPk).toString('hex') === Buffer.from(issuerPk).toString('hex')) found = true;
    }
    console.log("Issuer authorized via iteration?", found);
    console.log("Issuer authorized via .member() ?", l.authorizedIssuers.member(issuerPk));
  } catch(e) {
    console.error("iterator error", e);
  }
  process.exit(0);
}
run();
