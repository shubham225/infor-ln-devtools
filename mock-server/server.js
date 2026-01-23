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

const MODULES = {"Table":[{"package":"az","module":["eih","ext","sli"]},{"package":"er","module":["com","eqp","ext","prt"]}],"Session":[{"package":"at","module":["com","ren"]},{"package":"ap","module":["arc","ecp","eih","ext","sli"]},{"package":"er","module":["com","ecp","eqp","ext","prt","ren"]}],"Script":[{"package":"at","module":["com","ren","trg"]},{"package":"ap","module":["arc","ecp","eih","ext","int","sli"]}]};

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

