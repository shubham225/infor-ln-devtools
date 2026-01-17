const express = require('express');
const cors = require('cors');
const AdmZip = require("adm-zip");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(express.json());

/**
 * UTILITIES
 */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Creates random table code like 000 → 999
function randomTableCode() {
  return String(randomInt(0, 999)).padStart(3, '0');
}

// Creates session code <tablecode>1<rest2>m000 e.g. 012 -> 0 1 2 => "0121 2 m000"
function randomSessionCode(tableCode) {
  const first = tableCode[0];
  const lastTwo = tableCode.slice(1);
  return `${first}1${lastTwo}m000`; // matches your format
}

// random tdext package/module
function randomPackageModule() {
  const pkgs = ["td", "er", "tc"];
  const mods = ["ext", "cfg", "bde", "com"];
  return {
    pkg: pkgs[randomInt(0, pkgs.length - 1)],
    mod: mods[randomInt(0, mods.length - 1)]
  };
}

/**
 * DATA GENERATION
 */

const tables = Array.from({ length: 6 }).map(() => {
  const { pkg, mod } = randomPackageModule();
  const code = randomTableCode();
  return {
    type: "table",
    package: pkg,
    module: mod,
    code
  };
});

const sessions = tables.map(t => {
  return {
    type: "session",
    package: t.package,
    module: t.module,
    code: randomSessionCode(t.code)
  };
});

// scripts combines sessions + tables as script artifacts
const scripts = [
  ...tables.map(t => ({
    type: "script",
    package: t.package,
    module: t.module,
    code: t.code
  })),
  ...sessions.map(s => ({
    type: "script",
    package: s.package,
    module: s.module,
    code: s.code
  }))
];

const components = [
  ...tables.map(t => ({
    type: "Table",
    package: t.package,
    module: t.module,
    code: t.code
  })),
  ...sessions.map(s => ({
    type: "Session",
    package: s.package,
    module: s.module,
    code: s.code
  })),
  ...sessions.map(s => ({
    type: "Script",
    package: s.package,
    module: s.module,
    code: s.code
  }))
]

const MODULES = {"Table":[{"package":"ci","module":["eih","ext","sli"]},{"package":"ei","module":["com","eqp","ext","prt"]},{"package":"em","module":["com"]},{"package":"er","module":["com","ert","ext"]},{"package":"tc","module":["arc","bod","cmw","cnh","com","crn","dsn","dvu","emm","ext","hit","hyl","ibd","kbl","kbt","kei","kme","kmp","kom","kth","mcf","mcs","mgn","sng","sod","thk","trc","tre","trm","tvh","utl","vol","wfl"]},{"package":"td","module":["ecp","ert","ext","ipu","pcg","pur","sls","tre","tst","wfl"]},{"package":"tf","module":["acp","acr","cmg","dvu","eai","ecp","ert","ett","ext","fam","fbs","fst","gld","rec","tst"]},{"package":"tg","module":["brg","ext","wms"]},{"package":"ti","module":["bom","cpr"]},{"package":"tp","module":["ext","pdm","ptc"]},{"package":"ts","module":["cfg","clm","ctm","ert","ext","hra","mdm","soc","spc"]},{"package":"wh","module":["ert","ext","ina","inh","inp","inr","ltc","pln","wmd"]},{"package":"xi","module":["api","bde","bom","cat","cmw","cnh","com","crn","dmo","dsn","ext","fit","ftl","hit","hyl","int","jcb","jhd","kbl","kbt","kei","kme","kmp","kth","mcf","oii","pur","ros","sng","ter","thk","tku","toy","tst","tvh","utl","vol","wbh"]}],"Session":[{"package":"at","module":["com","ren"]},{"package":"ci","module":["arc","ecp","eih","ext","sli"]},{"package":"ei","module":["com","ecp","eqp","ext","prt","ren"]},{"package":"em","module":["com","cor","ext"]},{"package":"er","module":["arc","com","ecp","ert","ext"]},{"package":"tc","module":["arc","bod","cmw","cnh","com","cor","crn","dsn","dvu","ecp","emm","ext","hit","hyl","ibd","kbl","kbt","kei","kme","kmp","kom","kth","mcf","mcs","mgn","sod","thk","trc","tre","tst","tvh","utl","vol","wfl"]},{"package":"td","module":["arc","dvu","ecp","ext","ipu","isa","mmt","pcg","pur","sls","tre","trg","tst","wfl"]},{"package":"tf","module":["acp","acr","arc","cat","cmg","dvu","eai","ecp","ert","ext","fam","fbs","fst","gld","rec","tre","tst"]},{"package":"tg","module":["brg","ext"]},{"package":"ti","module":["bom","cpr","hra","ipd","sfc","trp"]},{"package":"tp","module":["ecp","ext","pdm","pss","ptc","tst"]},{"package":"ts","module":["arc","cfg","clm","ctm","ecp","ert","ext","hra","mdm","oes","soc","spc","tre"]},{"package":"wh","module":["arc","ecp","ext","ina","inh","inp","inr","ltc","pln","tre","wmd"]},{"package":"xi","module":["api","arc","bde","bom","cat","cmw","cnh","com","crn","dmo","dsn","ecp","ext","fit","ftl","hit","hyl","int","jcb","jhd","kbl","kbt","kei","kme","kmp","kth","kws","mcf","oii","pur","ros","ter","thk","tku","toy","tst","tvh","utl","vol","wbh"]}],"Script":[{"package":"at","module":["com","ren","trg"]},{"package":"ci","module":["arc","ecp","eih","ext","int","sli"]},{"package":"ei","module":["com","ecp","eqp","ext","prt","ren"]},{"package":"em","module":["com","cor","ext"]},{"package":"er","module":["arc","com","ecp","ert","ext","fam","int"]},{"package":"tc","module":["arc","aur","bde","bod","boi","ccp","cmw","cnh","com","cor","cri","dsn","dvu","ecp","emm","ext","fin","hit","hyl","ibd","int","kbl","kbt","kei","kme","kmp","kom","kth","mcf","mcs","mgn","mig","pct","pmc","sod","stl","tcs","thk","tls","trc","tre","trn","tst","tvh","utl","vol","wfl","zzz"]},{"package":"td","module":["arc","boi","cms","cor","dvu","ecp","ext","int","ipu","isa","mmt","pcg","pst","pur","ron","sls","smi","tre","trg","tst","wfl"]},{"package":"tf","module":["acp","acr","arc","boi","cat","cmg","cor","dvu","eai","ecp","ert","ext","fam","fbs","fst","gld","int","rec","tre","tst"]},{"package":"tg","module":["brg","ext","int","wms"]},{"package":"ti","module":["bom","cpr","cst","edm","hra","int","ipd","pcf","pcs","sfc","trp"]},{"package":"tp","module":["boi","cor","ecp","ext","hrs","int","pdm","pin","ppc","pss","ptc","tst"]},{"package":"ts","module":["arc","boi","cfg","clm","cor","ctm","ecp","epc","ert","ext","hra","int","mdm","oes","soc","spc","tre","tst"]},{"package":"wh","module":["arc","boi","cor","ecp","esp","ext","ina","inh","inp","inr","int","ltc","pln","tre","tst","whm","wmd"]},{"package":"xi","module":["api","arc","bde","boi","bom","cat","cmw","cnh","com","crn","dmo","dsn","ecp","ext","fit","ftl","hit","hyl","int","jcb","jhd","kbl","kbt","kei","kme","kmp","kth","kus","kws","mcf","oii","pur","ros","sls","tax","ter","thk","tku","toy","tst","tvh","utl","vol","wbh"]}]};

// Mock VRCs list
const VRCS = ["E50C_1_E501", "E50C_2_E502", "E50C_3_E503", "PROD_1_E601", "PROD_2_E602", "DEV_1_E701"];

/**
 * ENDPOINTS
 */
app.post("/api/vrc", (req, res) => {
  console.log("VRCs request received:", req.body);
  res.json(VRCS);
});

app.post("/api/module", (req, res) => {
  console.log("Module request received:", req.body);
  res.json(MODULES);
});

app.post("/api/component", (req, res) => {
  const { type, package: pkg, module } = req.body;

  if (!type || !pkg || !module) {
    return res.status(400).json({
      error: "Missing required fields: type, package, module"
    });
  }

  // generate a random count of codes (5–10)
  const count = Math.floor(Math.random() * 6) + 5;

  // generate codes like ####m###
  const codes = Array.from({ length: count }).map((_, i) => {
    const head = String(i * 10).padStart(4, "0");
    const tail = String(Math.floor(Math.random() * 9) * 100).padStart(3, "0");
    return `${head}m${tail}`;
  });

  res.json({
    type,
    package: pkg,
    module,
    code: codes
  });
});

app.use(bodyParser.json());

// Generate random numeric ID (5 digits)
function generateId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Random file generator
function randomFiles(zip, basePath, count) {
  for (let i = 1; i <= count; i++) {
    const content = `Random test content for ${basePath} file ${i}`;
    zip.addFile(`${basePath}/file${i}.txt`, Buffer.from(content));
  }
}

app.post("/api/import", (req, res) => {
  const { vrc, importFolder, components } = req.body;
    console.log("Request Received: \n", req.body)
  if (!importFolder) {
    return res.status(400).send("importFolder required");
  }

  const root = importFolder;
  const zip = new AdmZip();

  // Always create TD & FD empty dirs
  zip.addFile(`${root}/TD/`, Buffer.alloc(0));
  zip.addFile(`${root}/FD/`, Buffer.alloc(0));

  // Group components by type
  const grouped = components.reduce((acc, comp) => {
    if (!acc[comp.type]) acc[comp.type] = [];
    acc[comp.type].push(comp);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([type, comps]) => {
    // Ensure directory exists
    zip.addFile(`${root}/${type}/`, Buffer.alloc(0));

    comps.forEach((c) => {
      const fileName = `${c.package}${c.module}${c.code}.txt`; // or `${c.package}_${c.module}_${c.code}.txt`

      const fileContent = `Component: ${c.type}\nPackage: ${c.package}\nModule: ${c.module}\nCode: ${c.code}\nVRC: ${vrc ?? ""}\n`;

      zip.addFile(`${root}/${type}/${fileName}`, Buffer.from(fileContent));
    });
  });

  const zipBuffer = zip.toBuffer();

  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${root}.zip"`,
    "Content-Length": zipBuffer.length,
  });

  res.send(zipBuffer);
});


app.listen(3000, () => {
  console.log('Mock LN server running at http://localhost:3000');
});

