# CompileAndPublish (ibau)

A CLI tool to compile frontend/backend modules, package them, compute hashes, and publish artifacts via SCP.  
Installed globally as the `ibau` binary and driven by a JSON configuration plus a per-module `.info` file.

---

## Features

- Build frontend (Vite) and backend (Node.js / Python) modules.  
- Package builds into a zip, compute SHA256 hashes, and generate manifests.  
- Upload artifacts via SCP and update remote process metadata through API.  

---

## Prerequisites

- Node.js (LTS recommended)  
- npm  
- For Python backend: Python with venv  
- Network access to SSH/SCP server and API defined in `builder_config.json`  

---

## Installation

Install globally so `ibau` is available on your system:

```powershell
npm install -g git+https://github.com/istyaq-ahmmed/uic_module_compile_and_update.git#v1.0.1
```

> Replace `v1.0.1` with the latest stable version.

---

## Configuration

1. Place `builder_config.json` next to the executable.  
   - Contains **environment-specific settings**: SSH credentials and API values.  
   - Example is provided as `builder_config.example.json`.

2. Ensure each module has:  
   - `.info` file with at least `id` and metadata.  
   - `build_config.json` controlling build steps and included files.

---

## CLI Usage

### Common Commands (Cheat Sheet)

| Command | Purpose |
|---------|---------|
| `ibau build -v 2` | Build and package module as **major version 2** |
| `ibau config --ssh.host <host> --ssh.usr <user> --ssh.pas <pass> --v2.key <API_KEY>` | Update builder configuration (SSH + API) |

---

## User instructions (step-by-step)

This section is for operators who need to build and publish modules. You don’t need to know the internal code of this tool.

### Setup

1. Copy the sample config to module CWD and edit it:
   [build_config.json](./build_config.json)
2. Run `ibau config` command to config builder.

### Run a local build

1. Ensure the module has either:
   - `package.json` (for Node backend or frontend), or  
   - `requirements.txt` (for Python backend).  
2. Make sure a valid `build_config.json` is present.  
3. Run:
   ```powershell
   ibau build -v 2
   ```
4. Watch the console output. At the end, you will see a `Build Log` (`stepLogs`) summarizing each step’s result.

### Where to find results

- Built files → `.\build\<id>\`  
- Packaged artifact → `.\build\v<version>+<id>.zip`  
- Hash manifest → `.\build\v<version>+<id>.json`  
- Console logs → terminal output during build  

### Including extra files in the package

To add extra files or directories, edit `build_config.json` under `build.backend.include`.  
Example:

```json
[
  {"type": "file", "from": "./config.yml", "to": "config.yml"},
  {"type": "dir", "from": "./lib", "to": "lib"}
]
```

Run the build again and check that the files appear inside `build\<id>\`.

### Running only frontend or backend

- To build **frontend only**: set `build.frontend.skip = false` and `build.backend.skip = true` in `build_config.json`.  
- To build **backend only**: set `build.backend.skip = false` and `build.frontend.skip = true`.

---

## Troubleshooting

- **Missing `builder_config.json`** → Copy from `builder_config.json` from the repo and set correct values.  
- **SSH/SCP failures** → Verify credentials, firewall, and network access.  
- **Frontend/backend build errors** → Check project manifests (`package.json` or `requirements.txt`) and dependencies try building manually.  
- **API errors** → Confirm API root URL and `apiKey` inside `builder_config.json`.  

---

## License

See `package.json` for author/license information.
