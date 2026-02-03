const express = require("express");
const cors = require("cors");
const AdmZip = require("adm-zip");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() }); // store files in memory
const router = express.Router();

/**
 * UTILITIES
 */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTableCode() {
  return String(randomInt(0, 999)).padStart(3, "0");
}

function randomSessionCode(tableCode) {
  const first = tableCode[0];
  const lastTwo = tableCode.slice(1);
  return `${first}1${lastTwo}m000`;
}

function randomPackageModule() {
  const pkgs = ["tt", "st", "dt", "td", "at", "ap", "az", "er"];
  const mods = ["abc","com","ext","eih","sli","eqp","prt","ren","trg","arc","ecp","int"];
  return {
    pkg: pkgs[randomInt(0, pkgs.length - 1)],
    mod: mods[randomInt(0, mods.length - 1)],
  };
}

/**
 * MOCK DATA
 */

const tables = Array.from({ length: 6 }).map(() => {
  const { pkg, mod } = randomPackageModule();
  const code = randomTableCode();
  return { type: "table", package: pkg, module: mod, code };
});

const sessions = tables.map((t) => ({
  type: "session",
  package: t.package,
  module: t.module,
  code: randomSessionCode(t.code),
}));

const scripts = [...tables, ...sessions].map((t) => ({
  type: "script",
  package: t.package,
  module: t.module,
  code: t.code,
}));

const MODULES = {
  Table: [{ package: "az", module: ["eih", "ext", "sli"] }, { package: "er", module: ["com", "eqp", "ext", "prt"] }],
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

const VRCS = ["DEV_VRC_001","DEV_VRC_002","TEST_VRC_001","PROD_VRC_001","CUSTOMER_VRC_A","CUSTOMER_VRC_B"];

const generateId = () => Math.random().toString(36).substring(2, 10);

/**
 * ROUTES
 */

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "UP", username: req.headers["x-username"] || "Shubham Shinde" });
});
router.get("/api/v1/health", (req, res) => res.redirect(307, "/health"));

// VRCs
router.get("/vrcs", (req, res) => res.json(VRCS));

router.get("/pmc/:pmc/vrc", (req, res) => {
  const { pmc } = req.params;
  res.json(VRCS.filter(v => v.includes(pmc.split("_")[0]) || Math.random() > 0.5));
});

// Package modules
router.get("/vrcs/:vrc/packages", (req, res) => res.json(MODULES));

// Components
router.get("/vrcs/:vrc/components", (req, res) => {
  const { type, package: pkg, module } = req.query;
  if (!type || !pkg || !module) return res.status(400).json({ error: "Missing type, package, or module" });

  const count = Math.floor(Math.random() * 6) + 5;
  const components = Array.from({ length: count }).map((_, i) => ({
    code: `${String(i * 10).padStart(4, "0")}m${String(randomInt(0, 9) * 100).padStart(3,"0")}`,
    desc: `Mock ${type} ${pkg}${module}${i}`
  }));

  res.json({ type, package: pkg, module, components });
});

// Import components (multipart/form-data or JSON)
router.post("/vrcs/:vrc/components/import", upload.any(), (req, res) => {
  const { components = [], importFolder = "import" } = req.body;

  console.log("Importing components:", components.length, "body:", req.body);

  const zip = new AdmZip();
  zip.addFile("TD/", Buffer.alloc(0));
  zip.addFile("FD/", Buffer.alloc(0));

  // Handle uploaded files
  if (req.files && req.files.length) {
    req.files.forEach(f => zip.addFile(`uploaded/${f.originalname}`, f.buffer));
  } else if (components.length) {
    components.forEach(c => {
      const filename = c.type === "Script" ? `${c.type}/${c.package}${c.module}${c.code}.bc` : `${c.type}/${c.package}${c.module}${c.code}.json`;
      zip.addFile(filename, Buffer.from(JSON.stringify(c, null, 2)));
    });
  }

  const out = zip.toBuffer();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${importFolder}.zip"`);
  res.send(out);
});

// PMC download
router.post("/pmc/:pmc/download", (req, res) => {
  const { pmc } = req.params;
  const comps = Array.from({ length: 4 }).map((_, i) => ({
    type: "Table",
    package: "td",
    module: "ext",
    code: `${String(i).padStart(4,"0")}m000`
  }));
  const zip = new AdmZip();
  zip.addFile("TD/", Buffer.alloc(0));
  comps.forEach(c => zip.addFile(`${c.type}/${c.package}${c.module}${c.code}.json`, Buffer.from(JSON.stringify(c, null, 2))));
  const out = zip.toBuffer();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${pmc}-export.zip"`);
  res.send(out);
});

// Project validation
router.post("/vrcs/:vrc/projects/validate", (req, res) => {
  const { projectName } = req.body;
  if (!projectName) {return res.json({ valid: false, errorMessage: "projectName required" })};
  res.json({ valid: true, warningMessage: Math.random() > 0.8 ? "Minor warning (mock)" : "" });
});

// Close project
router.post("/vrcs/:vrc/projects/close", (req, res) => res.json({ success: true }));

// Script upload
router.post("/vrcs/:vrc/components/Script/:scriptName/source", upload.any(), (req, res) => {
  const id = generateId();
  res.json({ script: req.params.scriptName, vrc: req.params.vrc, path: `/mock/path/${id}`, success: true });
});

// Script compile
router.post("/vrcs/:vrc/components/Script/:scriptName/compile", (req, res) => {
  const zip = new AdmZip();
  zip.addFile("output.log", Buffer.from("Compilation mock output\nAll good"));
  const out = zip.toBuffer();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.scriptName}-compile.zip"`);
  res.send(out);
});

// Mount router
app.use("/api/V1", router);

// Start server
app.listen(3000, () => {
  console.log("Mock LN server running at http://localhost:3000");
});
