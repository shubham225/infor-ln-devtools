const express = require('express');
const cors = require('cors');
const AdmZip = require("adm-zip");
const bodyParser = require("body-parser");
const xml2js = require("xml2js");
const os = require("os");
const fs = require("fs");
const path = require("path");
const SevenZip = require("node-7z-archive");

const app = express();
app.use(cors());
app.use(express.text({ type: 'text/xml' }));
app.use(bodyParser.json());

/**
 * UTILITIES
 */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTableCode() {
  return String(randomInt(0, 999)).padStart(3, '0');
}

function randomSessionCode(tableCode) {
  const first = tableCode[0];
  const lastTwo = tableCode.slice(1);
  return `${first}1${lastTwo}m000`;
}

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
  return { type: "table", package: pkg, module: mod, code };
});

const sessions = tables.map(t => ({
  type: "session",
  package: t.package,
  module: t.module,
  code: randomSessionCode(t.code)
}));

const scripts = [
  ...tables.map(t => ({ type: "script", package: t.package, module: t.module, code: t.code })),
  ...sessions.map(s => ({ type: "script", package: s.package, module: s.module, code: s.code }))
];

const components = [
  ...tables.map(t => ({ type: "Table", package: t.package, module: t.module, code: t.code })),
  ...sessions.map(s => ({ type: "Session", package: s.package, module: s.module, code: s.code })),
  ...sessions.map(s => ({ type: "Script", package: s.package, module: s.module, code: s.code }))
];

const MODULES = {"Table":[{"package":"az","module":["eih","ext","sli"]},{"package":"er","module":["com","eqp","ext","prt"]}],"Session":[{"package":"at","module":["com","ren"]},{"package":"ap","module":["arc","ecp","eih","ext","sli"]},{"package":"er","module":["com","ecp","eqp","ext","prt","ren"]}],"Script":[{"package":"at","module":["com","ren","trg"]},{"package":"ap","module":["arc","ecp","eih","ext","int","sli"]}]};

// Mock VRCs list
const VRCS = ["E50C_1_E501", "E50C_2_E502", "E50C_3_E503", "PROD_1_E601", "PROD_2_E602", "DEV_1_E701"];

/**
 * SOAP UTILITIES
 */

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseSoapRequest(xmlBody) {
  const parser = new xml2js.Parser({ explicitArray: false });
  
  return new Promise((resolve, reject) => {
    parser.parseString(xmlBody, (err, result) => {
      if (err) {
        return reject(new Error("Failed to parse SOAP request: " + err.message));
      }

      try {
        const envelope = result.Envelope || result['S:Envelope'];
        const body = envelope.Body || envelope['S:Body'];
        const getRequestXML = body.getRequestXML;
        const dataArea = getRequestXML.getRequestXMLRequest.DataArea;
        const bdeNamespace = dataArea.BDENamespace;

        const interfaceId = bdeNamespace.InterfaceID;
        const method = bdeNamespace.Method;
        const rawRequest = bdeNamespace.Request.RawRequest;
        let requestBody = {};
        try {
          requestBody = JSON.parse(rawRequest);
        } catch (e) {
          console.warn("Failed to parse RawRequest as JSON:", rawRequest);
        }

        resolve({
          interfaceId,
          method,
          requestBody
        });
      } catch (err) {
        reject(new Error("Failed to extract SOAP data: " + err.message));
      }
    });
  });
}

function buildSoapResponse(responseData) {
  const rawResponse = JSON.stringify(responseData);
  const escapedResponse = rawResponse;

  return `<?xml version="1.0" ?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <getRequestXMLResponse xmlns="http://www.infor.com/businessinterface/BDENamespace">
      <getRequestXMLResponse xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="">
        <DataArea>
          <BDENamespace>
            <RawResponse>${escapedResponse}</RawResponse>
          </BDENamespace>
        </DataArea>
      </getRequestXMLResponse>
    </getRequestXMLResponse>
  </S:Body>
</S:Envelope>`;
}

/**
 * SOAP ENDPOINT
 */

app.post("/c4ws/services/BDENamespace/ERP_SERVER", async (req, res) => {
  try {
    // Parse SOAP request
    const { interfaceId, method, requestBody } = await parseSoapRequest(req.body);

    console.log("SOAP Request - Method:", method, "InterfaceID:", interfaceId);
    console.log("Request Body:", requestBody);

    let responseData;

    // Handle different methods
    if (method === "fetchModules") {
      responseData = MODULES;
    } 
    else if (method === "fetchVRCs") {
      responseData = {vrcs: VRCS };
    }
    else if (method === "fetchComponents") {
      const { type, package: pkg, module } = requestBody;

      if (!type || !pkg || !module) {
        return res.status(400).type('text/xml').send(buildSoapResponse({
          error: "Missing required fields: type, package, module"
        }));
      }

      const count = Math.floor(Math.random() * 32) + 5;
      const components = Array.from({ length: count }).map((_, i) => {
        const head = String(i * 10).padStart(4, "0");
        const tail = String(Math.floor(Math.random() * 9) * 100).padStart(3, "0");
        const code = `${head}m${tail}`;
        return {
          code,
          desc: `[${type}] - ${pkg}${module}${code}`
        };
      });

      responseData = {
        type,
        package: pkg,
        module,
        components
      };
    }
    else if (method === "downloadComponents") {
      const archiveType = "zip";
        if (archiveType == "7z") {
        const { vrc, importFolder, components } = requestBody;

        if (!importFolder) {
          return res.status(400).type("text/xml").send(buildSoapResponse({
            error: "importFolder required"
          }));
        }

        // --- create temp dir for 7z ---
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-7z-"));
        const archivePath = path.join(tempDir, "components.7z");

        // create folder structure in tempDir
        ["TD", "FD", "Script"].forEach(dir => fs.mkdirSync(path.join(tempDir, dir), { recursive: true }));

        // group components
        const grouped = components.reduce((acc, comp) => {
          if (!acc[comp.type]) acc[comp.type] = [];
          acc[comp.type].push(comp);
          return acc;
        }, {});

        Object.entries(grouped).forEach(([type, comps]) => {
          const typeDir = path.join(tempDir, type);
          if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true });

          comps.forEach((c) => {
            const fileName = `${c.package}${c.module}${c.code}.txt`;
            const content = `Component: ${c.type}\nPackage: ${c.package}\nModule: ${c.module}\nCode: ${c.code}\nVRC: ${vrc ?? ""}\n`;
            fs.writeFileSync(path.join(typeDir, fileName), content);
          });
        });

        // add manifest
        const manifestContent = `Component: Manifest Header\nPackage: Manifest file Row 1\n`;
        fs.writeFileSync(path.join(tempDir, "Script", "manifest.csv"), manifestContent);

        // --- create 7z archive ---
        await SevenZip.createArchive(archivePath, [tempDir], {});

        // read back archive as base64
        const archiveBuffer = fs.readFileSync(archivePath);
        const base64 = archiveBuffer.toString("base64");

        responseData = { "content-type": "application/7z", data: base64 };

        // cleanup temp dir
        fs.rmSync(tempDir, { recursive: true, force: true });
      } else {
        const { vrc, importFolder, components } = requestBody;

        if (!importFolder) {
          return res.status(400).type('text/xml').send(buildSoapResponse({
            error: "importFolder required"
          }));
        }

        const zip = new AdmZip();

        zip.addFile(`TD/`, Buffer.alloc(0));
        zip.addFile(`FD/`, Buffer.alloc(0));

        const grouped = components.reduce((acc, comp) => {
          if (!acc[comp.type]) acc[comp.type] = [];
          acc[comp.type].push(comp);
          return acc;
        }, {});

        Object.entries(grouped).forEach(([type, comps]) => {
          zip.addFile(`${type}/`, Buffer.alloc(0));

          comps.forEach(c => {
            const fileName = `${c.package}${c.module}${c.code}.txt`;
            const content = `Component: ${c.type}\nPackage: ${c.package}\nModule: ${c.module}\nCode: ${c.code}\nVRC: ${vrc ?? ""}\n`;

            zip.addFile(`${type}/${fileName}`, Buffer.from(content));
          });
        });
        
        const fileName = `manifest.csv`;
        const content = `Component: Manifest Header\nPackage: Manifest file Row 1"}\n`;

        zip.addFile(`Script/${fileName}`, Buffer.from(content));

        const zipBuffer = zip.toBuffer();
        const base64 = zipBuffer.toString('base64');

        responseData = { "content-type": "application/zip", data: base64 };
      }
    }
    else if (method === "downloadComponentsByPMC") {
      const { pmc, vrc } = requestBody;

      console.log("Download by PMC Request:", requestBody);

      if (!pmc || !vrc) {
        return res.status(400).type('text/xml').send(buildSoapResponse({
          error: "pmc and vrc are required"
        }));
      }

      const zip = new AdmZip();

      zip.addFile(`TD/`, Buffer.alloc(0));
      zip.addFile(`FD/`, Buffer.alloc(0));

      // Create some sample components based on PMC
      const sampleComponents = [
        { type: "Table", package: "td", module: "ext", code: "001" },
        { type: "Session", package: "tc", module: "com", code: "S01" },
        { type: "Script", package: "er", module: "ext", code: "SCR1" }
      ];

      const grouped = sampleComponents.reduce((acc, comp) => {
        if (!acc[comp.type]) acc[comp.type] = [];
        acc[comp.type].push(comp);
        return acc;
      }, {});

      Object.entries(grouped).forEach(([type, comps]) => {
        zip.addFile(`${type}/`, Buffer.alloc(0));

        comps.forEach(c => {
          const fileName = `${c.package}${c.module}${c.code}.txt`;
          const content = `Component: ${c.type}\nPackage: ${c.package}\nModule: ${c.module}\nCode: ${c.code}\nPMC: ${pmc}\nBase VRC: ${vrc}\n`;

          zip.addFile(`${type}/${fileName}`, Buffer.from(content));
        });
      });
      
      const fileName = `manifest.csv`;
      const content = `Component: PMC Manifest Header\nPMC: ${pmc}\nBase VRC: ${vrc}\n`;

      zip.addFile(`Script/${fileName}`, Buffer.from(content));

      const zipBuffer = zip.toBuffer();
      const base64 = zipBuffer.toString('base64');

      responseData = { "content-type": "application/zip", data: base64 };
      
    } 
    else if (method === "closeProject") {
        responseData = { "success": true, "error": "" };
    }
    else {
      return res.status(400).type('text/xml').send(buildSoapResponse({
        error: "Unknown Method: " + method
      }));
    }

    // Build and send SOAP response
    const soapResponse = buildSoapResponse(responseData);
    console.log("SOAP Response Data:", soapResponse);
    res.type('text/xml').send(soapResponse);

  } catch (err) {
    console.error("SOAP Error:", err);
    res.status(500).type('text/xml').send(buildSoapResponse({
      error: err.message
    }));
  }
});

/**
 * SERVER START
 */

app.listen(3001, () => {
  console.log("Mock SOAP LN server running at http://localhost:3001");
  console.log("SOAP Endpoint: POST http://localhost:3001/c4ws/services/BDENamespace/ERP_SERVER");
});
