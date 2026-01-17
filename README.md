# LN DevTools Extension 
[![VS Marketplace](https://img.shields.io/badge/VS%20Code-Extension-blue)]()
![Version](https://img.shields.io/badge/Version-v0.0.1-9f7aea)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Infor LN](https://img.shields.io/badge/ERP-Infor%20LN-critical)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

**LN DevTools** is a Visual Studio Code extension designed to enhance developer workflow for **Infor LN ERP** by allowing developers to browse, select, and import LN components directly into a local development workspace folder.

## 🚀 Key Features

### 📦 Component Exploration
- Components displayed in hierarchical tree:
  ```
  Type → Package → Module → Component Code
  ```
- Supported component types:
  - **Table**
  - **Session**
  - **Script**
- Lazy backend loading:
  - `/api/modules` loads type → package → module
  - `/api/components` loads module → codes

### 🎯 Selection Panel
- Dedicated "Selected Components" panel
- Grouping by type
- Supports:
  - Remove individual
  - Remove all
  - Import Selected

### 🧰 Import Workflow
When imported:
1. Selected components sent to backend
2. Backend returns ZIP
3. ZIP extracted to:
   ```
   <Workspace>/Development/<ProjectFolder>/
   ```
4. Tree selection cleared

### ⚙ Persistent Settings
Stored in VS Code global state:
- `Backend API URL`
- `Base VRC`
- `Project Folder`

## 🖥️ Extension UI Overview

### 📦 **Component Explorer**
Shows all LN components grouped by type:

![Component Explorer](./docs/screenshots/component-explorer.png)

### 📥 **Import Component Flow**
Selection + Import trigger:

![Import Component](./docs/screenshots/import-component.png)

### 🧰 **DevTools Panel**
Includes VRC / PMC / Server URL configuration + export/import controls:

![DevTools Panel](./docs/screenshots/devtools-panel.png)

# 🧩 Backend API Contract

The extension expects the following backend endpoints:

## 1) `POST /api/modules`

Used to populate the tree hierarchy.

### Request:
```json
{
  "baseVrc": "E50C_1_E501"
}
```

### Response format:
```json
{
  "Table": [
    { "package": "tc", "module": ["ecp", "cmm"] }
  ],
  "Session": [
    { "package": "tc", "module": ["ecp"] }
  ],
  "Script": [
    { "package": "tc", "module": ["ecp"] }
  ]
}
```

## 2) `POST /api/components`

Triggered when user expands a module node (lazy-load).

### Request:
```json
{
  "baseVrc": "E50C_1_E501",
  "type": "<Table|Session|Script>",
  "package": "tc",
  "module": "ecp"
}
```

### Response:
```json
{
  "baseVrc": "E50C_1_E501",
  "type": "Table",
  "package": "tc",
  "module": "ecp",
  "code": ["001", "002", "003"]
}
```

## 3) `POST /api/import`

Triggered on Import operation.

### Request:
```json
{
  "baseVrc": "E50C_1_E501",
  "importFolder": "EDM-222",
  "components": [
    { "type": "Table", "package": "tc", "module": "ecp", "code": "001" },
    { "type": "Session", "package": "tc", "module": "ecp", "code": "003" }
  ]
}
```

### Response:
Binary ZIP

Headers:
```
Content-Type: application/zip
Content-Disposition: attachment; filename="<importFolder>.zip"
```

ZIP is extracted to:
```
<Workspace>/Development/<ProjectFolder>/
```

# 📁 Extracted Folder Structure

Expected after import:

```
Development/
 └── <project-name>/
      ├── TD/
      ├── FD/
      ├── Table/
      ├── Session/
      └── Script/
```

# ⚙ Commands

| Command | Action |
|---|---|
| Refresh | Reload package tree from backend |
| Configure Settings | Update Base VRC + Project Folder |
| Update Server URL | Change API endpoint |
| Select Component | Add/remove from selection |
| Import Selected | Triggers `/import` and add files in Development folder |


# 📅 Roadmap Ideas

Future enhancements:
- Export support 
- Compilation support
- Check-in / Check-out support

# 📜 License
This project is licensed under the **MIT License** – see the [LICENSE](LICENSE.md) file for details.