const express = require("express");
const cors = require("cors");
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
  return String(randomInt(0, 999)).padStart(3, "0");
}

// Creates session code <tablecode>1<rest2>m000 e.g. 012 -> 0 1 2 => "0121 2 m000"
function randomSessionCode(tableCode) {
  const first = tableCode[0];
  const lastTwo = tableCode.slice(1);
  return `${first}1${lastTwo}m000`; // matches your format
}

// random tdext package/module
function randomPackageModule() {
  const pkgs = ["tt", "st", "dt", "td", "at", "ap", "az", "er"];
  const mods = [
    "abc",
    "com",
    "ext",
    "eih",
    "sli",
    "eqp",
    "prt",
    "ren",
    "trg",
    "arc",
    "ecp",
    "int",
  ];
  return {
    pkg: pkgs[randomInt(0, pkgs.length - 1)],
    mod: mods[randomInt(0, mods.length - 1)],
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
    code,
  };
});

const sessions = tables.map((t) => {
  return {
    type: "session",
    package: t.package,
    module: t.module,
    code: randomSessionCode(t.code),
  };
});

// scripts combines sessions + tables as script artifacts
const scripts = [
  ...tables.map((t) => ({
    type: "script",
    package: t.package,
    module: t.module,
    code: t.code,
  })),
  ...sessions.map((s) => ({
    type: "script",
    package: s.package,
    module: s.module,
    code: s.code,
  })),
];

const components = [
  ...tables.map((t) => ({
    type: "Table",
    package: t.package,
    module: t.module,
    code: t.code,
  })),
  ...sessions.map((s) => ({
    type: "Session",
    package: s.package,
    module: s.module,
    code: s.code,
  })),
  ...sessions.map((s) => ({
    type: "Script",
    package: s.package,
    module: s.module,
    code: s.code,
  })),
];

const MODULES = {
  Table: [
    { package: "az", module: ["eih", "ext", "sli"] },
    { package: "er", module: ["com", "eqp", "ext", "prt"] },
  ],
  Session: [
    { package: "at", module: ["com", "ren"] },
    { package: "ap", module: ["arc", "ecp", "eih", "ext", "sli"] },
    { package: "er", module: ["com", "ecp", "eqp", "ext", "prt", "ren"] },
  ],
  Script: [
    { package: "at", module: ["com", "ren", "trg"] },
    { package: "ap", module: ["arc", "ecp", "eih", "ext", "int", "sli"] },
  ],
};

// Mock VRCs list
const VRCS = [
  "DEV_VRC_001",
  "DEV_VRC_002",
  "TEST_VRC_001",
  "PROD_VRC_001",
  "CUSTOMER_VRC_A",
  "CUSTOMER_VRC_B",
];

generateId = () => {
  return Math.random().toString(36).substring(2, 10);
};

// -------------------------
// REST-style endpoints
// -------------------------

// Health check
app.get("/api/v1/health", (req, res) => {
  console.log("Health check request received:", req.body);
  res.json({
    status: "UP",
    username: req.headers["x-username"] || "Shubham Shinde",
  });
});

// VRCs
app.get("/api/v1/vrc", (req, res) => {
  console.log("VRCs request received:", req.body);
  res.json(VRCS);
});

app.get("/api/v1/pmc/:pmc/vrc", (req, res) => {
  console.log("VRC by PMC:", req.body);
  const { pmc } = req.params;
  // return subset or same list for mock
  res.json(
    VRCS.filter((v) => v.includes(pmc.split("_")[0]) || Math.random() > 0.5),
  );
});

// Package modules (maps to existing MODULES fixture)
app.post("/api/v1/packageModules", (req, res) => {
  const { vrc } = req.body;
  console.log("packageModules request", req.body);
  res.json(MODULES);
});

// Components list (maintain same response shape as earlier /api/component)
app.post("/api/v1/component", (req, res) => {
  const { type, package: pkg, module } = req.body;
  console.log("/component", req.body);
  if (!type || !pkg || !module) {
    return res
      .status(400)
      .json({ error: "Missing required fields: type, package, module" });
  }
  const count = Math.floor(Math.random() * 6) + 5;
  const codes = Array.from({ length: count }).map((_, i) => {
    const head = String(i * 10).padStart(4, "0");
    const tail = String(Math.floor(Math.random() * 9) * 100).padStart(3, "0");
    return {
      code: `${head}m${tail}`,
      desc: `Mock ${type} ${pkg}${module}${head}`,
    };
  });
  res.json({ type, package: pkg, module, components: codes });
});

// Download components -> return { data: <base64-zip> } to match existing client expectations
app.post("/api/v1/component/download", (req, res) => {
  const { vrc, importFolder, components = [] } = req.body;
  console.log("/component/download", req.body);
  const zip = new AdmZip();
  zip.addFile(`TD/`, Buffer.alloc(0));
  zip.addFile(`FD/`, Buffer.alloc(0));
  components.forEach((c, idx) => {
    if (c.type === "Script") {
      zip.addFile(
        `${c.type}/${c.package}${c.module}${c.code}.bc`,
        Buffer.from(JSON.stringify(c, null, 2)),
      );
    } else {
      zip.addFile(
        `${c.type}/${c.package}${c.module}${c.code}.json`,
        Buffer.from(JSON.stringify(c, null, 2)),
      );
    }
  });
  const base64 = zip.toBuffer().toString("base64");
  res.json({ data: base64 });
});

app.post("/api/v1/pmc/:pmc/download", (req, res) => {
  const { pmc } = req.params;
  console.log("/pmc/:pmc/download", pmc, req.body);
  // reuse component/download logic with dummy components
  const comps = Array.from({ length: 4 }).map((_, i) => ({
    type: "Table",
    package: "td",
    module: "ext",
    code: `${String(i).padStart(4, "0")}m000`,
  }));
  const zip = new AdmZip();
  zip.addFile(`TD/`, Buffer.alloc(0));
  comps.forEach((c) => {
    if (c.type === "Script") {
      zip.addFile(
        `${c.type}/${c.package}${c.module}${c.code}.bc`,
        Buffer.from(JSON.stringify(c, null, 2)),
      );
    } else {
      zip.addFile(
        `${c.type}/${c.package}${c.module}${c.code}.json`,
        Buffer.from(JSON.stringify(c, null, 2)),
      );
    }
  });
  res.json({ data: zip.toBuffer().toString("base64") });
});

// Project validation
app.post("/api/v1/validate", (req, res) => {
  const { projectName, vrc } = req.body;
  console.log("/validate", req.body);
  if (!projectName || !vrc) {
    return res.json({
      valid: false,
      errorMessage: "projectName and vrc are required",
    });
  }
  // simple mock validation
  res.json({
    valid: true,
    warningMessage: Math.random() > 0.8 ? "Minor warning (mock)" : "",
  });
});

// Close project
app.post("/api/v1/project/close", (req, res) => {
  console.log("/api/v1/project/close:", req.body);
  console.log("/project/close", req.body);
  res.json({ success: true });
});

// Script upload/compile
app.post("/api/v1/component/script/upload", (req, res) => {
  console.log("/component/script/upload", Object.keys(req.body));
  const id = generateId();
  res.json({
    script: req.body.script,
    vrc: req.body.vrc,
    path: `/mock/path/${id}`,
    success: true,
  });
});

app.post("/api/v1/component/script/compile", (req, res) => {
  console.log("/component/script/compile", req.body.script);
  const zip = new AdmZip();
  zip.addFile("output.log", Buffer.from("Compilation mock output\nAll good"));
  res.json({
    script: req.body.script,
    vrc: req.body.vrc,
    compileSuccess: true,
    compilationOutput: zip.toBuffer().toString("base64"),
  });
});

app.listen(3000, () => {
  console.log("Mock LN server running at http://localhost:3000");
});
