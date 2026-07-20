import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const nodeCommand = process.execPath;
const viteCli = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const electronCli = path.join(process.cwd(), "node_modules", "electron", "cli.js");

async function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function isPortAvailable(port) {
  return (await canListen(port, "127.0.0.1")) && (await canListen(port, "0.0.0.0"));
}

async function findAvailablePort(startPort = 5173) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available Vite port found between ${startPort} and ${startPort + 99}.`);
}

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(check, 250);
        }
      });
    };
    check();
  });
}

await run(nodeCommand, [viteCli, "build", "--config", "vite.main.config.ts"]);
await run(nodeCommand, [viteCli, "build", "--config", "vite.preload.config.ts"]);

const devPort = await findAvailablePort();
const devServerUrl = `http://127.0.0.1:${devPort}`;
const vite = spawnProcess(nodeCommand, [
  viteCli,
  "--host",
  "127.0.0.1",
  "--port",
  String(devPort),
  "--strictPort"
]);

try {
  await waitForServer(devServerUrl);
} catch (error) {
  vite.kill();
  throw error;
}

const electron = spawnProcess(nodeCommand, [electronCli, "."], {
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_ENABLE_STACK_DUMPING: "1",
    VITE_DEV_SERVER_URL: devServerUrl
  }
});

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  electron.kill();
  vite.kill();
});
